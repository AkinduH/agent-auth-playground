// Workflow node types
export type NodeType = 'chatTrigger' | 'aiAgent' | 'llm';

// Position interface for React Flow
export interface Position {
  x: number;
  y: number;
}

// Base node data structure
export interface BaseNodeData {
  label: string;
  [key: string]: any;
}

// Chat Trigger node data
export interface ChatTriggerNodeData extends BaseNodeData {
  label: 'Chat Trigger';
}

// AI Agent node data
export interface AIAgentNodeData extends BaseNodeData {
  label: 'AI Agent';
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}

// LLM node data
export interface LLMNodeData extends BaseNodeData {
  label: 'LLM';
  provider: 'gemini' | 'openai';
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

// Node type union
export type NodeData = ChatTriggerNodeData | AIAgentNodeData | LLMNodeData;

// React Flow node structure
export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: Position;
  data: NodeData;
  selected?: boolean;
}

// React Flow edge structure
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
}

// Complete workflow definition
export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: number;
  updatedAt: number;
}

// Chat message
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  workflowId?: string;
}

// Execution context for workflow runner
export interface ExecutionContext {
  workflowId: string;
  variables: Record<string, any>;
  chatHistory: ChatMessage[];
  currentInput: string;
}

// LLM Provider interface
export interface LLMProvider {
  name: 'gemini' | 'openai';
  generateResponse(
    message: string,
    systemPrompt: string,
    options: {
      temperature: number;
      maxTokens: number;
      model: string;
    }
  ): Promise<string>;
  listModels(): Promise<string[]>;
}

// Workflow execution result
export interface ExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
}
