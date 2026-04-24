import { MCPDiscoveredTool } from '../mcpClientNode';
import { ConnectedMCPClient, AgentToolBinding } from './types';
import {
  normalizeToolName,
  ensureUniqueToolName,
  normalizeInputSchema,
  stringifyToolResult,
} from './utils';

export async function executeMCPClient(
  tool: AgentToolBinding,
  args: Record<string, unknown>
): Promise<string> {
  console.log(`[MCPClient] Calling tool "${tool.publicName}" with args: ${JSON.stringify(args)}`);
  const result = await tool.client.callTool(tool.sourceToolName, args);
  console.log(`[MCPClient] Tool "${tool.publicName}" returned result: ${JSON.stringify(result)}`);
  return stringifyToolResult(result);
}

export async function buildAgentToolBindings(
  clients: ConnectedMCPClient[]
): Promise<AgentToolBinding[]> {
  const bindings: AgentToolBinding[] = [];
  const usedNames = new Set<string>();

  for (const client of clients) {
    const tools = await client.runtime.listTools();

    for (const tool of tools) {
      const generatedName = normalizeToolName(`${tool.name}_${client.nodeId}`);
      const publicName = ensureUniqueToolName(generatedName, usedNames);
      bindings.push(createToolBinding(publicName, client, tool));
    }
  }

  return bindings;
}

function createToolBinding(
  publicName: string,
  client: ConnectedMCPClient,
  tool: MCPDiscoveredTool
): AgentToolBinding {
  return {
    publicName,
    sourceToolName: tool.name,
    description: tool.description,
    parameters: normalizeInputSchema(tool.inputSchema),
    endpoint: client.endpoint,
    client: client.runtime,
  };
}
