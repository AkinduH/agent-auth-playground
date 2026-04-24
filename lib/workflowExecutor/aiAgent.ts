import { WorkflowNode, AIAgentNodeData, LLMNodeData, ExecutionContext } from '../types';
import { ConnectedMCPClient, AgentToolBinding } from './types';
import { executeMCPClient, buildAgentToolBindings } from './mcpClient';
import {
  getErrorMessage,
  formatMemoryMessages,
  getAgentStepLimit,
  parseAgentDecision,
} from './utils';

// ── LLM execution ─────────────────────────────────────────────────────────────

export async function executeLLM(
  node: WorkflowNode,
  context: ExecutionContext,
  apiKeys: Partial<Record<'gemini' | 'openai' | 'anthropic', string>>,
  baseUrl: string,
  message?: string,
  systemPrompt?: string
): Promise<string> {
  const data = node.data as LLMNodeData;
  const resolvedMessage = message ?? context.currentInput;
  const resolvedSystemPrompt = systemPrompt ?? data.systemPrompt;

  console.log(`[LLM:${node.id}] Calling ${data.provider}/${data.model}`);

  return invokeLLM(data, resolvedMessage, resolvedSystemPrompt, apiKeys, baseUrl);
}

async function invokeLLM(
  data: LLMNodeData,
  message: string,
  systemPrompt: string,
  apiKeys: Partial<Record<'gemini' | 'openai' | 'anthropic', string>>,
  baseUrl: string
): Promise<string> {
  const apiKey = apiKeys[data.provider];

  if (!apiKey) {
    throw new Error(
      `No API key configured for ${data.provider}. Please set up your credentials.`
    );
  }

  try {
    const response = await fetch(new URL('/api/execute-llm', baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: data.provider,
        model: data.model,
        message,
        systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        apiKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'LLM execution failed');
    }

    return result.output;
  } catch (error) {
    throw new Error(`LLM execution failed: ${getErrorMessage(error)}`);
  }
}

// ── Prompt builders ────────────────────────────────────────────────────────────

export function buildAgentSystemPrompt(systemPrompt: string): string {
  const basePrompt = systemPrompt?.trim() || 'You are a helpful assistant.';

  return [
    basePrompt,
    'You are an autonomous agent that can decide to answer directly or call tools.',
    'Respond with valid JSON only and no markdown code fences.',
    'Allowed response formats:',
    '{"type":"final","response":"..."}',
    '{"type":"tool","name":"tool_name","arguments":{}}',
    'Use only tools provided in the current request.',
    'If a tool call is not needed, return type "final".',
  ].join('\n');
}

export function buildAgentStepPrompt(
  userInput: string,
  memoryContext: string,
  tools: AgentToolBinding[],
  toolExecutionLog: string[],
  step: number,
  maxSteps: number
): string {
  const functionSchemas = tools.map((tool) => ({
    name: tool.publicName,
    description: tool.description || `MCP tool ${tool.sourceToolName} exposed by ${tool.endpoint}`,
    parameters: tool.parameters,
  }));

  return [
    `Step ${step} of ${maxSteps}. Decide the next best action for the user.`,
    `Current user request:\n${userInput}`,
    `Memory context:\n${memoryContext}`,
    `Available function schemas:\n${JSON.stringify(functionSchemas, null, 2)}`,
    `Tool execution context:\n${
      toolExecutionLog.length > 0 ? toolExecutionLog.join('\n\n') : '(no tools used yet)'
    }`,
    'Return only one JSON object in the required format.',
  ].join('\n\n');
}

export function buildAgentFallbackPrompt(
  userInput: string,
  memoryContext: string,
  toolExecutionLog: string[]
): string {
  return [
    'Create the final answer for the user based on all available context.',
    `Current user request:\n${userInput}`,
    `Memory context:\n${memoryContext}`,
    `Tool execution context:\n${
      toolExecutionLog.length > 0 ? toolExecutionLog.join('\n\n') : '(no tools were used)'
    }`,
    'Respond with plain text only.',
  ].join('\n\n');
}

// ── AI Agent execution loop ────────────────────────────────────────────────────

export async function executeAIAgent(
  node: WorkflowNode,
  llmNode: WorkflowNode,
  connectedClients: ConnectedMCPClient[],
  context: ExecutionContext,
  apiKeys: Partial<Record<'gemini' | 'openai' | 'anthropic', string>>,
  baseUrl: string
): Promise<string> {
  const data = node.data as AIAgentNodeData;
  const toolExecutionLog: string[] = [];
  const memoryContext = formatMemoryMessages(context.memoryMessages);
  const maxToolSteps = getAgentStepLimit(data);

  console.log(
    `[AIAgent:${node.id}] Starting — LLM: ${llmNode.id}, MCP clients: ${connectedClients.length}`
  );

  const availableTools = await buildAgentToolBindings(connectedClients);

  console.log(
    `[AIAgent:${node.id}] Available tools: [${availableTools.map((t) => t.publicName).join(', ') || 'none'}]`
  );

  for (let step = 1; step <= maxToolSteps; step += 1) {
    console.log(`[AIAgent:${node.id}] Step ${step}/${maxToolSteps}`);

    const stepPrompt = buildAgentStepPrompt(
      context.currentInput,
      memoryContext,
      availableTools,
      toolExecutionLog,
      step,
      maxToolSteps
    );

    const rawDecision = await executeLLM(
      llmNode,
      context,
      apiKeys,
      baseUrl,
      stepPrompt,
      buildAgentSystemPrompt(data.systemPrompt)
    );
    const decision = parseAgentDecision(rawDecision);

    if (!decision) {
      console.log(`[AIAgent:${node.id}] Step ${step}: unparseable LLM response, returning raw output`);
      const fallbackResponse = rawDecision.trim();
      context.variables['agentOutput'] = fallbackResponse;
      return fallbackResponse;
    }

    if (decision.type === 'final') {
      console.log(`[AIAgent:${node.id}] Step ${step}: final answer`);
      const finalResponse = decision.response.trim() || rawDecision.trim();
      context.variables['agentOutput'] = finalResponse;
      return finalResponse;
    }

    const selectedTool = availableTools.find((t) => t.publicName === decision.name);

    if (!selectedTool) {
      console.warn(
        `[AIAgent:${node.id}] Step ${step}: unknown tool "${decision.name}" — available: [${availableTools.map((t) => t.publicName).join(', ') || 'none'}]`
      );
      toolExecutionLog.push(
        `Step ${step}: Unknown tool "${decision.name}" was requested. Available tools: ${
          availableTools.map((t) => t.publicName).join(', ') || '(none)'
        }.`
      );
      continue;
    }

    console.log(
      `[AIAgent:${node.id}] Step ${step}: calling tool "${selectedTool.publicName}" with args ${JSON.stringify(decision.arguments)}`
    );

    try {
      const toolResult = await executeMCPClient(selectedTool, decision.arguments);
      console.log(`[AIAgent:${node.id}] Step ${step}: tool "${selectedTool.publicName}" succeeded`);
      toolExecutionLog.push(
        [
          `Step ${step} tool call`,
          `Tool: ${selectedTool.publicName} (${selectedTool.sourceToolName} @ ${selectedTool.endpoint})`,
          `Arguments: ${JSON.stringify(decision.arguments)}`,
          `Result: ${toolResult}`,
        ].join('\n')
      );
    } catch (error) {
      console.error(
        `[AIAgent:${node.id}] Step ${step}: tool "${selectedTool.publicName}" failed: ${getErrorMessage(error)}`
      );
      toolExecutionLog.push(
        `Step ${step} tool call failed for ${selectedTool.publicName}: ${getErrorMessage(error)}`
      );
    }
  }

  console.log(`[AIAgent:${node.id}] Max steps reached — generating fallback answer`);

  const fallbackOutput = await executeLLM(
    llmNode,
    context,
    apiKeys,
    baseUrl,
    buildAgentFallbackPrompt(context.currentInput, memoryContext, toolExecutionLog),
    data.systemPrompt || 'You are a helpful assistant.'
  );

  context.variables['agentOutput'] = fallbackOutput;
  return fallbackOutput;
}
