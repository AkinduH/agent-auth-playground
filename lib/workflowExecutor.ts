import 'server-only';

import {
  Workflow,
  WorkflowNode,
  ExecutionContext,
  ExecutionResult,
  AIAgentNodeData,
  LLMNodeData,
  MCPClientNodeData,
  ChatMessage,
} from './types';
import {
  MCPClientNodeRuntime,
  MCPDiscoveredTool,
  MCPToolCallResult,
} from './mcpClientNode';
import { authenticateAgent } from './agentAuth';

interface ConnectedMCPClient {
  endpoint: string;
  nodeId: string;
  runtime: MCPClientNodeRuntime;
}

interface AgentToolBinding {
  publicName: string;
  sourceToolName: string;
  description?: string;
  parameters: Record<string, unknown>;
  endpoint: string;
  client: MCPClientNodeRuntime;
}

type AgentDecision =
  | {
      type: 'final';
      response: string;
    }
  | {
      type: 'tool';
      name: string;
      arguments: Record<string, unknown>;
    };

export class WorkflowExecutor {
  private workflow: Workflow;
  private context: ExecutionContext;
  private apiKeys: Partial<Record<'gemini' | 'openai' | 'anthropic', string>>;
  private baseUrl: string;

  constructor(
    workflow: Workflow,
    initialInput: string,
    workflowId: string,
    apiKeys: Partial<Record<'gemini' | 'openai' | 'anthropic', string>> = {},
    baseUrl?: string,
    memoryMessages: ChatMessage[] = []
  ) {
    this.workflow = workflow;
    this.apiKeys = apiKeys;
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    this.context = {
      workflowId,
      variables: {},
      memoryMessages,
      currentInput: initialInput,
    };
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      console.log('[Workflow] Starting execution');

      const chatTriggerNode = this.workflow.nodes.find((n) => n.type === 'chatTrigger');

      if (!chatTriggerNode) {
        throw new Error('No Chat Trigger node found in workflow');
      }

      const output = await this.executeNode(chatTriggerNode.id);
      const executionTime = Date.now() - startTime;

      console.log(`[Workflow] Completed in ${executionTime}ms`);

      return {
        success: true,
        output,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = this.getErrorMessage(error);

      console.error(`[Workflow] Failed after ${executionTime}ms: ${errorMessage}`);

      return {
        success: false,
        output: '',
        error: errorMessage,
        executionTime,
      };
    }
  }

  private async initializeMCPClients(
    mcpNodes: WorkflowNode[],
    agentData?: AIAgentNodeData
  ): Promise<ConnectedMCPClient[]> {
    return Promise.all(
      mcpNodes.map(async (node) => {
        const nodeData = node.data as MCPClientNodeData;
        const endpoint = nodeData.mcpServerEndpoint?.trim();

        if (!endpoint) {
          throw new Error(`[MCPClient:${node.id}] Missing server endpoint`);
        }

        const runtime = new MCPClientNodeRuntime();

        if (nodeData.useOAuth2) {
          if (!nodeData.oauth2OrganizationName?.trim()) {
            throw new Error(`[MCPClient:${node.id}] OAuth2 organization name is required`);
          }
          if (!nodeData.oauth2ClientId?.trim()) {
            throw new Error(`[MCPClient:${node.id}] OAuth2 client ID is required`);
          }
          if (!nodeData.oauth2RedirectUri?.trim()) {
            throw new Error(`[MCPClient:${node.id}] OAuth2 redirect URI is required`);
          }
          if (!agentData?.agentId?.trim()) {
            throw new Error(`[MCPClient:${node.id}] Agent ID is required on the connected AI Agent node for OAuth2`);
          }
          if (!agentData?.agentSecret?.trim()) {
            throw new Error(`[MCPClient:${node.id}] Agent Secret is required on the connected AI Agent node for OAuth2`);
          }

          console.log(`[MCPClient:${node.id}] Running OAuth2 agent authentication flow`);
          const accessToken = await authenticateAgent({
            organizationName: nodeData.oauth2OrganizationName,
            clientId: nodeData.oauth2ClientId,
            redirectUri: nodeData.oauth2RedirectUri,
            agentId: agentData.agentId,
            agentSecret: agentData.agentSecret,
            scope: nodeData.oauth2Scope,
          });
          runtime.setAccessToken(accessToken);
          console.log(`[MCPClient:${node.id}] Access token obtained`);
        }

        console.log(`[MCPClient:${node.id}] Connecting to ${endpoint}`);
        await runtime.connect(endpoint);
        console.log(`[MCPClient:${node.id}] Connected`);

        return { endpoint, nodeId: node.id, runtime };
      })
    );
  }

  private async executeNode(nodeId: string): Promise<string> {
    const node = this.workflow.nodes.find((n) => n.id === nodeId);

    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    switch (node.type) {
      case 'chatTrigger':
        return this.executeChatTrigger(node);
      case 'aiAgent':
        return this.executeAIAgent(node);
      case 'llm':
        return this.executeLLM(node);
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  private async executeChatTrigger(node: WorkflowNode): Promise<string> {
    console.log(`[ChatTrigger:${node.id}] Received input: "${this.context.currentInput}"`);

    const connectedEdges = this.workflow.edges.filter((e) => e.source === node.id);

    if (connectedEdges.length === 0) {
      return this.context.currentInput;
    }

    return this.executeNode(connectedEdges[0].target);
  }

  private async executeAIAgent(node: WorkflowNode): Promise<string> {
    const data = node.data as AIAgentNodeData;

    const llmNode = this.getOutgoingNodes(node.id).find((n) => n.type === 'llm');
    if (!llmNode) {
      throw new Error(`[AIAgent:${node.id}] Must connect to an AI Service node`);
    }

    const mcpNodes = this.collectMCPNodes(node.id);
    const connectedClients = await this.initializeMCPClients(mcpNodes, data);

    console.log(
      `[AIAgent:${node.id}] Starting — LLM: ${llmNode.id}, MCP clients: ${connectedClients.length}`
    );

    const toolExecutionLog: string[] = [];
    const memoryContext = this.formatMemoryMessages(this.context.memoryMessages);
    const maxToolSteps = this.getAgentStepLimit(data);

    try {
      const availableTools = await this.buildAgentToolBindings(connectedClients);

      console.log(
        `[AIAgent:${node.id}] Available tools: [${availableTools.map((t) => t.publicName).join(', ') || 'none'}]`
      );

      for (let step = 1; step <= maxToolSteps; step += 1) {
        console.log(`[AIAgent:${node.id}] Step ${step}/${maxToolSteps}`);

        const stepPrompt = this.buildAgentStepPrompt(
          this.context.currentInput,
          memoryContext,
          availableTools,
          toolExecutionLog,
          step,
          maxToolSteps
        );

        const rawDecision = await this.executeLLM(
          llmNode,
          stepPrompt,
          this.buildAgentSystemPrompt(data.systemPrompt)
        );
        const decision = this.parseAgentDecision(rawDecision);

        if (!decision) {
          console.log(`[AIAgent:${node.id}] Step ${step}: unparseable LLM response, returning raw output`);
          const fallbackResponse = rawDecision.trim();
          this.context.variables['agentOutput'] = fallbackResponse;
          return fallbackResponse;
        }

        if (decision.type === 'final') {
          console.log(`[AIAgent:${node.id}] Step ${step}: final answer`);
          const finalResponse = decision.response.trim() || rawDecision.trim();
          this.context.variables['agentOutput'] = finalResponse;
          return finalResponse;
        }

        const selectedTool = availableTools.find((tool) => tool.publicName === decision.name);

        if (!selectedTool) {
          console.warn(
            `[AIAgent:${node.id}] Step ${step}: unknown tool "${decision.name}" — available: [${availableTools.map((t) => t.publicName).join(', ') || 'none'}]`
          );
          toolExecutionLog.push(
            `Step ${step}: Unknown tool "${decision.name}" was requested. Available tools: ${availableTools
              .map((tool) => tool.publicName)
              .join(', ') || '(none)'}.`
          );
          continue;
        }

        console.log(
          `[AIAgent:${node.id}] Step ${step}: calling tool "${selectedTool.publicName}" with args ${JSON.stringify(decision.arguments)}`
        );

        try {
          const toolResult = await this.executeMCPClient(selectedTool, decision.arguments);

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
            `[AIAgent:${node.id}] Step ${step}: tool "${selectedTool.publicName}" failed: ${this.getErrorMessage(error)}`
          );
          toolExecutionLog.push(
            `Step ${step} tool call failed for ${selectedTool.publicName}: ${this.getErrorMessage(error)}`
          );
        }
      }

      console.log(`[AIAgent:${node.id}] Max steps reached — generating fallback answer`);

      const fallbackOutput = await this.executeLLM(
        llmNode,
        this.buildAgentFallbackPrompt(this.context.currentInput, memoryContext, toolExecutionLog),
        data.systemPrompt || 'You are a helpful assistant.'
      );

      this.context.variables['agentOutput'] = fallbackOutput;
      return fallbackOutput;
    } finally {
      await Promise.all(
        connectedClients.map(({ runtime }) => runtime.disconnect().catch(() => undefined))
      );
    }
  }

  private async executeMCPClient(
    tool: AgentToolBinding,
    args: Record<string, unknown>
  ): Promise<string> {
    console.log(`[MCPClient: Calling tool "${tool.publicName}" with args: ${JSON.stringify(args)}`);
    const result = await tool.client.callTool(tool.sourceToolName, args);
    console.log(`[MCPClient: Tool "${tool.publicName}" returned result: ${JSON.stringify(result)}`);
    return this.stringifyToolResult(result);
  }

  private async executeLLM(
    node: WorkflowNode,
    message?: string,
    systemPrompt?: string
  ): Promise<string> {
    const data = node.data as LLMNodeData;
    const resolvedMessage = message ?? this.context.currentInput;
    const resolvedSystemPrompt = systemPrompt ?? data.systemPrompt;

    console.log(`[LLM:${node.id}] Calling ${data.provider}/${data.model}`);

    return this.invokeLLM(data, resolvedMessage, resolvedSystemPrompt);
  }

  private async invokeLLM(
    data: LLMNodeData,
    message: string,
    systemPrompt: string
  ): Promise<string> {
    const apiKey = this.apiKeys[data.provider];

    if (!apiKey) {
      throw new Error(
        `No API key configured for ${data.provider}. Please set up your credentials.`
      );
    }

    try {
      const response = await fetch(new URL('/api/execute-llm', this.baseUrl), {
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
      throw new Error(`LLM execution failed: ${this.getErrorMessage(error)}`);
    }
  }

  private getOutgoingNodes(nodeId: string): WorkflowNode[] {
    return this.workflow.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => this.workflow.nodes.find((node) => node.id === edge.target))
      .filter((node): node is WorkflowNode => Boolean(node));
  }

  private getIncomingNodes(nodeId: string): WorkflowNode[] {
    return this.workflow.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => this.workflow.nodes.find((node) => node.id === edge.source))
      .filter((node): node is WorkflowNode => Boolean(node));
  }

  // Collects all MCP nodes connected to an AIAgent (both directions), deduplicated.
  private collectMCPNodes(agentNodeId: string): WorkflowNode[] {
    const outgoing = this.getOutgoingNodes(agentNodeId).filter((n) => n.type === 'mcpClient');
    const incoming = this.getIncomingNodes(agentNodeId).filter((n) => n.type === 'mcpClient');

    return Array.from(
      new Map([...outgoing, ...incoming].map((n) => [n.id, n])).values()
    );
  }

  private async buildAgentToolBindings(
    clients: ConnectedMCPClient[]
  ): Promise<AgentToolBinding[]> {
    const bindings: AgentToolBinding[] = [];
    const usedNames = new Set<string>();

    for (const client of clients) {
      const tools = await client.runtime.listTools();

      for (const tool of tools) {
        const generatedName = this.normalizeToolName(`${tool.name}_${client.nodeId}`);
        const publicName = this.ensureUniqueToolName(generatedName, usedNames);

        bindings.push(this.createToolBinding(publicName, client, tool));
      }
    }

    return bindings;
  }

  private createToolBinding(
    publicName: string,
    client: ConnectedMCPClient,
    tool: MCPDiscoveredTool
  ): AgentToolBinding {
    return {
      publicName,
      sourceToolName: tool.name,
      description: tool.description,
      parameters: this.normalizeInputSchema(tool.inputSchema),
      endpoint: client.endpoint,
      client: client.runtime,
    };
  }

  private normalizeToolName(value: string): string {
    let normalized = value
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!normalized) {
      normalized = 'tool';
    }

    if (!/^[a-z_]/.test(normalized)) {
      normalized = `tool_${normalized}`;
    }

    return normalized.slice(0, 64);
  }

  private ensureUniqueToolName(baseName: string, usedNames: Set<string>): string {
    if (!usedNames.has(baseName)) {
      usedNames.add(baseName);
      return baseName;
    }

    let index = 2;
    while (index < 1000) {
      const suffix = `_${index}`;
      const candidate = `${baseName.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
      index += 1;
    }

    throw new Error('Unable to create a unique function name for MCP tool mapping.');
  }

  private normalizeInputSchema(
    inputSchema: Record<string, unknown> | undefined
  ): Record<string, unknown> {
    if (
      inputSchema &&
      typeof inputSchema === 'object' &&
      inputSchema.type === 'object'
    ) {
      return inputSchema;
    }

    return {
      type: 'object',
      properties: {},
    };
  }

  private getAgentStepLimit(data: AIAgentNodeData): number {
    const value = data.maxToolSteps ?? 6;
    if (!Number.isFinite(value)) {
      return 6;
    }

    return Math.min(12, Math.max(1, Math.floor(value)));
  }

  private formatMemoryMessages(memoryMessages: ChatMessage[]): string {
    if (!memoryMessages || memoryMessages.length === 0) {
      return '(no saved memory)';
    }

    return memoryMessages
      .slice(-16)
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n');
  }

  private buildAgentSystemPrompt(systemPrompt: string): string {
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

  private buildAgentStepPrompt(
    userInput: string,
    memoryContext: string,
    tools: AgentToolBinding[],
    toolExecutionLog: string[],
    step: number,
    maxSteps: number
  ): string {
    const functionSchemas = tools.map((tool) => ({
      name: tool.publicName,
      description:
        tool.description ||
        `MCP tool ${tool.sourceToolName} exposed by ${tool.endpoint}`,
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

  private buildAgentFallbackPrompt(
    userInput: string,
    memoryContext: string,
    toolExecutionLog: string[]
  ): string {
    return [
      'Create the final answer for the user based on all available context.',
      `Current user request:\n${userInput}`,
      `Memory context:\n${memoryContext}`,
      `Tool execution context:\n${
        toolExecutionLog.length > 0
          ? toolExecutionLog.join('\n\n')
          : '(no tools were used)'
      }`,
      'Respond with plain text only.',
    ].join('\n\n');
  }

  private parseAgentDecision(rawDecision: string): AgentDecision | null {
    const parsed = this.parseJsonObject(rawDecision);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const asRecord = parsed as Record<string, unknown>;

    if (asRecord.type === 'final' && typeof asRecord.response === 'string') {
      return {
        type: 'final',
        response: asRecord.response,
      };
    }

    if (asRecord.type === 'tool' && typeof asRecord.name === 'string') {
      const rawArguments = asRecord.arguments;
      const argumentsObject =
        rawArguments && typeof rawArguments === 'object'
          ? (rawArguments as Record<string, unknown>)
          : {};

      return {
        type: 'tool',
        name: asRecord.name,
        arguments: argumentsObject,
      };
    }

    return null;
  }

  private parseJsonObject(value: string): unknown {
    const trimmed = value.trim();

    try {
      return JSON.parse(trimmed);
    } catch {
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');

      if (firstBrace < 0 || lastBrace <= firstBrace) {
        return null;
      }

      const slice = trimmed.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
  }

  private stringifyToolResult(toolResult: MCPToolCallResult): string {
    const textContent = toolResult.content?.trim();
    if (textContent) {
      return textContent;
    }

    if (toolResult.structuredContent) {
      return JSON.stringify(toolResult.structuredContent);
    }

    return JSON.stringify(toolResult.raw);
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    return 'Unknown error';
  }
}
