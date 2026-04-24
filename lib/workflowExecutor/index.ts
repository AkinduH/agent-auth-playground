import 'server-only';

import {
  Workflow,
  WorkflowNode,
  ExecutionContext,
  ExecutionResult,
  AIAgentNodeData,
  ChatMessage,
} from '../types';
import { initializeMCPClients } from './mcpInitializer';
import { executeChatTrigger } from './chatTrigger';
import { executeAIAgent, executeLLM } from './aiAgent';
import { getErrorMessage } from './utils';

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

      return { success: true, output, executionTime };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = getErrorMessage(error);

      console.error(`[Workflow] Failed after ${executionTime}ms: ${errorMessage}`);

      return { success: false, output: '', error: errorMessage, executionTime };
    }
  }

  private async executeNode(nodeId: string): Promise<string> {
    const node = this.workflow.nodes.find((n) => n.id === nodeId);

    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }

    switch (node.type) {
      case 'chatTrigger':
        return executeChatTrigger(
          node,
          this.workflow,
          this.context.currentInput,
          (id) => this.executeNode(id)
        );

      case 'aiAgent':
        return this.runAIAgent(node);

      case 'llm':
        return executeLLM(node, this.context, this.apiKeys, this.baseUrl);

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  private async runAIAgent(node: WorkflowNode): Promise<string> {
    const llmNode = this.getOutgoingNodes(node.id).find((n) => n.type === 'llm');
    if (!llmNode) {
      throw new Error(`[AIAgent:${node.id}] Must connect to an AI Service node`);
    }

    const mcpNodes = this.collectMCPNodes(node.id);
    const connectedClients = await initializeMCPClients(mcpNodes, node.data as AIAgentNodeData);

    try {
      return await executeAIAgent(
        node,
        llmNode,
        connectedClients,
        this.context,
        this.apiKeys,
        this.baseUrl
      );
    } finally {
      await Promise.all(
        connectedClients.map(({ runtime }) => runtime.disconnect().catch(() => undefined))
      );
    }
  }

  private getOutgoingNodes(nodeId: string): WorkflowNode[] {
    return this.workflow.edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => this.workflow.nodes.find((n) => n.id === edge.target))
      .filter((n): n is WorkflowNode => Boolean(n));
  }

  private getIncomingNodes(nodeId: string): WorkflowNode[] {
    return this.workflow.edges
      .filter((edge) => edge.target === nodeId)
      .map((edge) => this.workflow.nodes.find((n) => n.id === edge.source))
      .filter((n): n is WorkflowNode => Boolean(n));
  }

  private collectMCPNodes(agentNodeId: string): WorkflowNode[] {
    const outgoing = this.getOutgoingNodes(agentNodeId).filter((n) => n.type === 'mcpClient');
    const incoming = this.getIncomingNodes(agentNodeId).filter((n) => n.type === 'mcpClient');
    return Array.from(new Map([...outgoing, ...incoming].map((n) => [n.id, n])).values());
  }
}
