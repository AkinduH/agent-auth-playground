import {
  Workflow,
  WorkflowNode,
  ExecutionContext,
  ExecutionResult,
  ChatTriggerNodeData,
  AIAgentNodeData,
  LLMNodeData,
} from './types';
import { workflowStore } from './workflowStore';

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
    baseUrl?: string
  ) {
    this.workflow = workflow;
    this.apiKeys = apiKeys;
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    this.context = {
      workflowId,
      variables: {},
      chatHistory: workflowStore.getChatHistory(),
      currentInput: initialInput,
    };
  }

  async execute(): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      console.log('Starting workflow execution');

      // Find the chat trigger node (entry point)
      const chatTriggerNode = this.workflow.nodes.find(
        (n) => n.type === 'chatTrigger'
      );

      if (!chatTriggerNode) {
        throw new Error('No Chat Trigger node found in workflow');
      }

      console.log('Found chat trigger node:', chatTriggerNode.id);

      // Execute workflow starting from chat trigger
      const output = await this.executeNode(chatTriggerNode.id);

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        output,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';

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

    // Chat trigger just passes the message through
    // Find connected nodes
    const connectedEdges = this.workflow.edges.filter(
      (e) => e.source === node.id
    );

    if (connectedEdges.length === 0) {
      // No output connection, return the message
      return this.context.currentInput;
    }

    // Execute first connected node
    const nextNodeId = connectedEdges[0].target;
    return this.executeNode(nextNodeId);
  }

  private async executeAIAgent(node: WorkflowNode): Promise<string> {
    const data = node.data as AIAgentNodeData;
    console.log('AI Agent processing with prompt:', data.systemPrompt);

    // AI Agent combines system prompt with input
    const agentInput = `${data.systemPrompt}\n\nUser input: ${this.context.currentInput}`;
    const previousOutput = agentInput;

    // Store in context for LLM
    this.context.variables['agentOutput'] = previousOutput;

    // Find connected nodes
    const connectedEdges = this.workflow.edges.filter(
      (e) => e.source === node.id
    );

    if (connectedEdges.length === 0) {
      return previousOutput;
    }

    // Update current input for next node
    const previousInput = this.context.currentInput;
    this.context.currentInput = previousOutput;

    const nextNodeId = connectedEdges[0].target;
    const result = await this.executeNode(nextNodeId);

    // Restore for other branches if needed
    this.context.currentInput = previousInput;

    return result;
  }

  private async executeLLM(node: WorkflowNode): Promise<string> {
    const data = node.data as LLMNodeData;
    console.log('LLM node executing with model:', data.model);

    // Keys are provided by the browser request payload because localStorage is not available on the server
    const apiKey = this.apiKeys[data.provider];

    if (!apiKey) {
      throw new Error(
        `No API key configured for ${data.provider}. Please set up your credentials.`
      );
    }

    // Call backend API to execute LLM
    try {
      const response = await fetch(new URL('/api/execute-llm', this.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: data.provider,
          model: data.model,
          message: this.context.currentInput,
          systemPrompt: data.systemPrompt,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          apiKey: apiKey, // Include API key from storage
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'LLM execution failed');
      }

      console.log('LLM response received');

      return result.output;
    } catch (error) {
      throw new Error(
        `LLM execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

// Helper to validate workflow
export function validateWorkflow(workflow: Workflow): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!workflow.nodes || workflow.nodes.length === 0) {
    errors.push('Workflow must contain at least one node');
  }

  const hasTrigger = workflow.nodes.some((n) => n.type === 'chatTrigger');
  if (!hasTrigger) {
    errors.push('Workflow must contain a Chat Trigger node');
  }

  // Check for orphaned nodes
  const connectedNodeIds = new Set<string>();
  connectedNodeIds.add(workflow.nodes.find((n) => n.type === 'chatTrigger')?.id || '');

  workflow.edges.forEach((edge) => {
    connectedNodeIds.add(edge.target);
  });

  workflow.nodes.forEach((node) => {
    if (!connectedNodeIds.has(node.id) && node.type !== 'chatTrigger') {
      errors.push(`Node ${node.data.label} is not connected to the workflow`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
