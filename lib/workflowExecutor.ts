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
  private apiKeys: Partial<Record<'gemini' | 'openai', string>>;
  private baseUrl: string;

  constructor(
    workflow: Workflow,
    initialInput: string,
    workflowId: string,
    apiKeys: Partial<Record<'gemini' | 'openai', string>> = {},
    baseUrl?: string,
    chatHistory: ChatMessage[] = []
  ) {
    this.workflow = workflow;
    this.apiKeys = apiKeys;
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    this.context = {
      workflowId,
      variables: {},
      chatHistory,
      currentInput: initialInput,
    };
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      console.log('Starting workflow execution');

      const chatTriggerNode = this.workflow.nodes.find((n) => n.type === 'chatTrigger');

      if (!chatTriggerNode) {
        throw new Error('No Chat Trigger node found in workflow');
      }

      console.log('Found chat trigger node:', chatTriggerNode.id);

      const output = await this.executeNode(chatTriggerNode.id);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        output,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = this.getErrorMessage(error);

      console.error('Workflow execution error:', errorMessage);

      return {
        success: false,
        output: '',
        error: errorMessage,
        executionTime,
      };
    }
  }

  private async executeNode(nodeId: string): Promise<string> {
    const node = this.workflow.nodes.find((n) => n.id === nodeId);

    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    console.log('Executing node:', nodeId, 'type:', node.type);

    switch (node.type) {
      case 'chatTrigger':
        return this.executeChatTrigger(node);
      case 'mcpClient':
        return this.executeMCPClient(node);
      case 'aiAgent':
        return this.executeAIAgent(node);
      case 'llm':
        return this.executeLLM(node);
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  private async executeChatTrigger(node: WorkflowNode): Promise<string> {
    console.log('Chat trigger received input:', this.context.currentInput);

    const connectedEdges = this.workflow.edges.filter((e) => e.source === node.id);

    if (connectedEdges.length === 0) {
      return this.context.currentInput;
    }

    const nextNodeId = connectedEdges[0].target;
    return this.executeNode(nextNodeId);
  }

  private async executeMCPClient(node: WorkflowNode): Promise<string> {
    const data = node.data as MCPClientNodeData;

    if (!data.mcpServerEndpoint?.trim()) {
      throw new Error('MCP Client node requires a server endpoint.');
    }

    const connectedEdges = this.workflow.edges.filter((e) => e.source === node.id);

    if (connectedEdges.length === 0) {
      return this.context.currentInput;
    }

    const nextNodeId = connectedEdges[0].target;
    return this.executeNode(nextNodeId);
  }

  private async executeAIAgent(node: WorkflowNode): Promise<string> {
    const data = node.data as AIAgentNodeData;
    const llmNode = this.getOutgoingNodes(node.id).find((connectedNode) => connectedNode.type === 'llm');

    if (!llmNode) {
      throw new Error('AI Agent node must connect to an AI Service node.');
    }

    const llmData = llmNode.data as LLMNodeData;
    const outgoingMCPNodes = this.getOutgoingNodes(node.id).filter(
      (connectedNode) => connectedNode.type === 'mcpClient'
    );
    const incomingMCPNodes = this.getIncomingNodes(node.id).filter(
      (connectedNode) => connectedNode.type === 'mcpClient'
    );
    const mcpDependencyNodes = Array.from(
      new Map(
        [...outgoingMCPNodes, ...incomingMCPNodes].map((connectedNode) => [
          connectedNode.id,
          connectedNode,
        ])
      ).values()
    );

    const connectedClients = await this.initializeMCPClients(mcpDependencyNodes);
    const toolExecutionLog: string[] = [];
    const conversationHistory = this.formatChatHistory(this.context.chatHistory);
    const maxToolSteps = this.getAgentStepLimit(data);

    try {
      const availableTools = await this.buildAgentToolBindings(connectedClients);

      for (let step = 1; step <= maxToolSteps; step += 1) {
        const stepPrompt = this.buildAgentStepPrompt(
          this.context.currentInput,
          conversationHistory,
          availableTools,
          toolExecutionLog,
          step,
          maxToolSteps
        );

        const rawDecision = await this.invokeLLM(
          llmData,
          stepPrompt,
          this.buildAgentSystemPrompt(data.systemPrompt)
        );
        const decision = this.parseAgentDecision(rawDecision);

        if (!decision) {
          const fallbackResponse = rawDecision.trim();
          this.context.variables['agentOutput'] = fallbackResponse;
          return fallbackResponse;
        }

        if (decision.type === 'final') {
          const finalResponse = decision.response.trim();
          const resolvedResponse = finalResponse.length > 0 ? finalResponse : rawDecision.trim();
          this.context.variables['agentOutput'] = resolvedResponse;
          return resolvedResponse;
        }

        const selectedTool = availableTools.find((tool) => tool.publicName === decision.name);

        if (!selectedTool) {
          toolExecutionLog.push(
            `Step ${step}: Unknown tool "${decision.name}" was requested. Available tools: ${availableTools
              .map((tool) => tool.publicName)
              .join(', ') || '(none)'}.`
          );
          continue;
        }

        try {
          const toolResult = await selectedTool.client.callTool(
            selectedTool.sourceToolName,
            decision.arguments
          );

          toolExecutionLog.push(
            [
              `Step ${step} tool call`,
              `Tool: ${selectedTool.publicName} (${selectedTool.sourceToolName} @ ${selectedTool.endpoint})`,
              `Arguments: ${JSON.stringify(decision.arguments)}`,
              `Result: ${this.stringifyToolResult(toolResult)}`,
            ].join('\n')
          );
        } catch (error) {
          toolExecutionLog.push(
            `Step ${step} tool call failed for ${selectedTool.publicName}: ${this.getErrorMessage(error)}`
          );
        }
      }

      const fallbackOutput = await this.invokeLLM(
        llmData,
        this.buildAgentFallbackPrompt(
          this.context.currentInput,
          conversationHistory,
          toolExecutionLog
        ),
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

  private async executeLLM(node: WorkflowNode): Promise<string> {
    const data = node.data as LLMNodeData;
    console.log('LLM node executing with model:', data.model);

    return this.invokeLLM(data, this.context.currentInput, data.systemPrompt);
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

  private async initializeMCPClients(
    mcpNodes: WorkflowNode[]
  ): Promise<ConnectedMCPClient[]> {
    return Promise.all(
      mcpNodes.map(async (node) => {
        const nodeData = node.data as MCPClientNodeData;
        const endpoint = nodeData.mcpServerEndpoint?.trim();

        if (!endpoint) {
          throw new Error(`MCP Client node ${node.id} is missing a server endpoint.`);
        }

        const runtime = new MCPClientNodeRuntime();
        await runtime.connect(endpoint);

        return {
          endpoint,
          nodeId: node.id,
          runtime,
        };
      })
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

  private formatChatHistory(chatHistory: ChatMessage[]): string {
    if (!chatHistory || chatHistory.length === 0) {
      return '(no prior conversation)';
    }

    return chatHistory
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
    conversationHistory: string,
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
      `Conversation context:\n${conversationHistory}`,
      `Available function schemas:\n${JSON.stringify(functionSchemas, null, 2)}`,
      `Tool execution context:\n${
        toolExecutionLog.length > 0 ? toolExecutionLog.join('\n\n') : '(no tools used yet)'
      }`,
      'Return only one JSON object in the required format.',
    ].join('\n\n');
  }

  private buildAgentFallbackPrompt(
    userInput: string,
    conversationHistory: string,
    toolExecutionLog: string[]
  ): string {
    return [
      'Create the final answer for the user based on all available context.',
      `Current user request:\n${userInput}`,
      `Conversation context:\n${conversationHistory}`,
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

