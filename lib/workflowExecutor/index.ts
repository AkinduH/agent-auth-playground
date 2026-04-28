import 'server-only';

import {
  Workflow,
  WorkflowNode,
  ExecutionContext,
  ExecutionResult,
  AIAgentNodeData,
  ChatMessage,
  LLMNodeData,
} from '../types';
import { initializeMCPClients } from './mcpInitializer';
import { executeChatTrigger } from './chatTrigger';
import { executeAIAgent, executeLLM } from './aiAgent';
import { getErrorMessage } from './utils';
import { WorkflowTrace, emptyTrace, dominantFlow } from '../authTrace';
import { CachedMCPToolsMap } from './types';

export type WorkflowEvent =
  | { type: 'node-start'; nodeId: string }
  | { type: 'node-end'; nodeId: string };

export type WorkflowEventHandler = (event: WorkflowEvent) => void;

export class WorkflowExecutor {
  private workflow: Workflow;
  private context: ExecutionContext;
  private apiKeys: Record<string, string>;
  private baseUrl: string;
  private oboTokens: Record<string, string>;
  private mcpDiscoveredTools: CachedMCPToolsMap;
  private trace: WorkflowTrace;
  private onEvent?: WorkflowEventHandler;

  constructor(
    workflow: Workflow,
    initialInput: string,
    workflowId: string,
    apiKeys: Record<string, string> = {},
    baseUrl?: string,
    memoryMessages: ChatMessage[] = [],
    oboTokens: Record<string, string> = {},
    onEvent?: WorkflowEventHandler,
    mcpDiscoveredTools: CachedMCPToolsMap = {}
  ) {
    this.workflow = workflow;
    this.apiKeys = apiKeys;
    this.baseUrl = baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    this.oboTokens = oboTokens;
    this.mcpDiscoveredTools = mcpDiscoveredTools;
    this.onEvent = onEvent;
    this.trace = emptyTrace();
    this.trace.userMessage = initialInput;

    const llmNode = workflow.nodes.find((n) => n.type === 'llm');
    if (llmNode) {
      const data = llmNode.data as LLMNodeData;
      this.trace.llm = { provider: data.provider, model: data.model };
    }

    this.context = {
      workflowId,
      variables: {},
      memoryMessages,
      currentInput: initialInput,
    };
  }

  async execute(): Promise<ExecutionResult & { trace: WorkflowTrace }> {
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

      this.trace.finishedAt = Date.now();
      this.trace.finalAnswer = output;
      this.trace.flow = dominantFlow(this.trace.mcps);

      return { success: true, output, executionTime, trace: this.trace };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = getErrorMessage(error);

      console.error(`[Workflow] Failed after ${executionTime}ms: ${errorMessage}`);

      this.trace.finishedAt = Date.now();
      this.trace.flow = dominantFlow(this.trace.mcps);

      return { success: false, output: '', error: errorMessage, executionTime, trace: this.trace };
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
          (id) => this.executeNode(id),
          this.onEvent
        );

      case 'aiAgent':
        return this.runAIAgent(node);

      case 'llm': {
        this.onEvent?.({ type: 'node-start', nodeId: node.id });
        try {
          return await executeLLM(node, this.context, this.apiKeys, this.baseUrl);
        } finally {
          this.onEvent?.({ type: 'node-end', nodeId: node.id });
        }
      }

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
    const connectedClients = await initializeMCPClients(
      mcpNodes,
      node.data as AIAgentNodeData,
      this.oboTokens,
      this.trace,
      this.mcpDiscoveredTools
    );

    this.onEvent?.({ type: 'node-start', nodeId: node.id });
    try {
      return await executeAIAgent(
        node,
        llmNode,
        connectedClients,
        this.context,
        this.apiKeys,
        this.baseUrl,
        this.trace,
        this.onEvent
      );
    } finally {
      this.onEvent?.({ type: 'node-end', nodeId: node.id });
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
