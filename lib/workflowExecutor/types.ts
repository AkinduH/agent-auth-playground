import { MCPClientNodeRuntime } from '../mcpClientNode';

export interface ConnectedMCPClient {
  endpoint: string;
  nodeId: string;
  runtime: MCPClientNodeRuntime;
}

export interface AgentToolBinding {
  publicName: string;
  sourceToolName: string;
  description?: string;
  parameters: Record<string, unknown>;
  endpoint: string;
  client: MCPClientNodeRuntime;
}

export type AgentDecision =
  | { type: 'final'; response: string }
  | { type: 'tool'; name: string; arguments: Record<string, unknown> };
