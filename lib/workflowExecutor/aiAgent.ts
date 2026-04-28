import { WorkflowNode, AIAgentNodeData, LLMNodeData, ExecutionContext } from '../types';
import { ConnectedMCPClient, AgentToolBinding } from './types';
import { WorkflowTrace } from '../authTrace';
import { executeMCPClient, buildAgentToolBindings } from './mcpClient';
import type { WorkflowEventHandler } from './index';
import {
  getErrorMessage,
  formatMemoryMessages,
  getAgentStepLimit,
  parseAgentDecision,
  searchToolBindings,
} from './utils';

const TOOL_SEARCH_NAME = 'tool_search';
const TOOL_SEARCH_LIMIT = 10;

const TOOL_SEARCH_SCHEMA = {
  name: TOOL_SEARCH_NAME,
  description:
    'Search the catalogue of available MCP tools by keyword. Returns up to 10 tool schemas matching your query; matched tools then become callable on subsequent steps.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords describing the capability you need (e.g., "send email", "list github issues").',
      },
    },
    required: ['query'],
  },
};

// ── LLM execution ─────────────────────────────────────────────────────────────

export async function executeLLM(
  node: WorkflowNode,
  context: ExecutionContext,
  apiKeys: Record<string, string>,
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
  apiKeys: Record<string, string>,
  baseUrl: string
): Promise<string> {
  const isGcpAuth = data.provider === 'gemini' && data.geminiAuthType === 'gcp-access-token';
  const gcpAccessToken = isGcpAuth ? apiKeys['gcpAccessToken'] : undefined;
  const gcpProjectId = isGcpAuth ? apiKeys['gcpProjectId'] : undefined;
  const apiKey = isGcpAuth ? undefined : apiKeys[data.provider];

  if (isGcpAuth && (!gcpAccessToken || !gcpProjectId)) {
    throw new Error('GCP Access Token and Project ID are required for Vertex AI. Please configure them in the LLM node.');
  }

  if (!isGcpAuth && !apiKey) {
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
        ...(isGcpAuth ? { gcpAccessToken, gcpProjectId } : { apiKey }),
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
    `You begin with only one tool: \`${TOOL_SEARCH_NAME}\`. The catalogue of MCP tools is large and not shown up-front.`,
    `To find a tool, call \`${TOOL_SEARCH_NAME}\` with {"query":"keywords"}. The result contains up to ${TOOL_SEARCH_LIMIT} matching tool schemas; once returned they remain available to call on later steps.`,
    'Only call tools whose schemas are listed in "Available function schemas" for the current step. If no listed tool fits, search for one first.',
    'If a tool call is not needed, return type "final".',
  ].join('\n');
}

export function buildAgentStepPrompt(
  userInput: string,
  memoryContext: string,
  exposedTools: AgentToolBinding[],
  toolExecutionLog: string[],
  step: number,
  maxSteps: number,
  totalToolCount: number
): string {
  const functionSchemas: Array<Record<string, unknown>> = [TOOL_SEARCH_SCHEMA];
  for (const tool of exposedTools) {
    functionSchemas.push({
      name: tool.publicName,
      description: tool.description || `MCP tool ${tool.sourceToolName} exposed by ${tool.endpoint}`,
      parameters: tool.parameters,
    });
  }

  return [
    `Step ${step} of ${maxSteps}. Decide the next best action for the user.`,
    `Current user request:\n${userInput}`,
    `Memory context:\n${memoryContext}`,
    `Tool catalogue size: ${totalToolCount} MCP tools available via \`${TOOL_SEARCH_NAME}\`.`,
    `Available function schemas (${functionSchemas.length}):\n${JSON.stringify(functionSchemas, null, 2)}`,
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
  apiKeys: Record<string, string>,
  baseUrl: string,
  trace?: WorkflowTrace,
  onEvent?: WorkflowEventHandler
): Promise<string> {
  const data = node.data as AIAgentNodeData;
  const toolExecutionLog: string[] = [];
  const memoryContext = formatMemoryMessages(context.memoryMessages);
  const maxToolSteps = getAgentStepLimit(data);

  console.log(
    `[AIAgent:${node.id}] Starting — LLM: ${llmNode.id}, MCP clients: ${connectedClients.length}`
  );

  const allBindings = await buildAgentToolBindings(connectedClients);
  const exposedToolNames = new Set<string>();

  console.log(
    `[AIAgent:${node.id}] Tool catalogue: ${allBindings.length} tools (exposed via ${TOOL_SEARCH_NAME})`
  );

  for (let step = 1; step <= maxToolSteps; step += 1) {
    console.log(`[AIAgent:${node.id}] Step ${step}/${maxToolSteps}`);

    const exposedTools = allBindings.filter((t) => exposedToolNames.has(t.publicName));
    const stepPrompt = buildAgentStepPrompt(
      context.currentInput,
      memoryContext,
      exposedTools,
      toolExecutionLog,
      step,
      maxToolSteps,
      allBindings.length
    );

    onEvent?.({ type: 'node-start', nodeId: llmNode.id });
    let rawDecision: string;
    try {
      rawDecision = await executeLLM(
        llmNode,
        context,
        apiKeys,
        baseUrl,
        stepPrompt,
        buildAgentSystemPrompt(data.systemPrompt)
      );
    } finally {
      onEvent?.({ type: 'node-end', nodeId: llmNode.id });
    }
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

    if (decision.name === TOOL_SEARCH_NAME) {
      const rawQuery = decision.arguments['query'];
      const query = typeof rawQuery === 'string' ? rawQuery.trim() : '';

      if (!query) {
        console.warn(`[AIAgent:${node.id}] Step ${step}: tool_search called without a query`);
        toolExecutionLog.push(
          `Step ${step} ${TOOL_SEARCH_NAME} call failed: missing required string argument "query".`
        );
        continue;
      }

      const matches = searchToolBindings(query, allBindings, TOOL_SEARCH_LIMIT);
      for (const m of matches) exposedToolNames.add(m.publicName);

      const matchSummary = matches.map((m) => ({
        name: m.publicName,
        description: m.description || `MCP tool ${m.sourceToolName} exposed by ${m.endpoint}`,
        parameters: m.parameters,
      }));

      console.log(
        `[AIAgent:${node.id}] Step ${step}: tool_search query="${query}" -> ${matches.length} match(es): [${matches.map((m) => m.publicName).join(', ') || 'none'}]`
      );

      toolExecutionLog.push(
        [
          `Step ${step} tool call`,
          `Tool: ${TOOL_SEARCH_NAME}`,
          `Arguments: ${JSON.stringify({ query })}`,
          `Result: ${JSON.stringify({ matches: matchSummary }, null, 2)}`,
        ].join('\n')
      );

      trace?.tools.push({
        step,
        publicName: TOOL_SEARCH_NAME,
        sourceToolName: TOOL_SEARCH_NAME,
        endpoint: 'local',
        nodeId: '',
        args: JSON.stringify({ query }),
        result: `${matches.length} match(es): ${matches.map((m) => m.publicName).join(', ')}`.slice(0, 500),
        ok: true,
      });

      continue;
    }

    const selectedTool = allBindings.find((t) => t.publicName === decision.name);

    if (!selectedTool || !exposedToolNames.has(selectedTool.publicName)) {
      const exposedList = Array.from(exposedToolNames).join(', ') || '(none yet)';
      console.warn(
        `[AIAgent:${node.id}] Step ${step}: tool "${decision.name}" not callable — exposed: [${exposedList}]`
      );
      toolExecutionLog.push(
        `Step ${step}: Tool "${decision.name}" is not currently exposed. Use ${TOOL_SEARCH_NAME} to discover and expose tools first. Currently exposed: ${exposedList}.`
      );
      continue;
    }

    console.log(
      `[AIAgent:${node.id}] Step ${step}: calling tool "${selectedTool.publicName}" with args ${JSON.stringify(decision.arguments)}`
    );

    const matchingClient = connectedClients.find((c) => c.endpoint === selectedTool.endpoint);
    const toolNodeId = matchingClient?.nodeId ?? '';

    if (toolNodeId) onEvent?.({ type: 'node-start', nodeId: toolNodeId });
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
      trace?.tools.push({
        step,
        publicName: selectedTool.publicName,
        sourceToolName: selectedTool.sourceToolName,
        endpoint: selectedTool.endpoint,
        nodeId: toolNodeId,
        args: JSON.stringify(decision.arguments),
        result: typeof toolResult === 'string' ? toolResult.slice(0, 500) : '',
        ok: true,
      });
    } catch (error) {
      console.error(
        `[AIAgent:${node.id}] Step ${step}: tool "${selectedTool.publicName}" failed: ${getErrorMessage(error)}`
      );
      toolExecutionLog.push(
        `Step ${step} tool call failed for ${selectedTool.publicName}: ${getErrorMessage(error)}`
      );
      trace?.tools.push({
        step,
        publicName: selectedTool.publicName,
        sourceToolName: selectedTool.sourceToolName,
        endpoint: selectedTool.endpoint,
        nodeId: toolNodeId,
        args: JSON.stringify(decision.arguments),
        result: getErrorMessage(error),
        ok: false,
      });
    } finally {
      if (toolNodeId) onEvent?.({ type: 'node-end', nodeId: toolNodeId });
    }
  }

  console.log(`[AIAgent:${node.id}] Max steps reached — generating fallback answer`);

  onEvent?.({ type: 'node-start', nodeId: llmNode.id });
  let fallbackOutput: string;
  try {
    fallbackOutput = await executeLLM(
      llmNode,
      context,
      apiKeys,
      baseUrl,
      buildAgentFallbackPrompt(context.currentInput, memoryContext, toolExecutionLog),
      data.systemPrompt || 'You are a helpful assistant.'
    );
  } finally {
    onEvent?.({ type: 'node-end', nodeId: llmNode.id });
  }

  context.variables['agentOutput'] = fallbackOutput;
  return fallbackOutput;
}
