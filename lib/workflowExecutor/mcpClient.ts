import { MCPClientNodeRuntime, MCPDiscoveredTool } from '../mcpClientNode';
import { AgentToolBinding, MCPClientConfig, CachedMCPToolsMap } from './types';
import {
  normalizeToolName,
  ensureUniqueToolName,
  normalizeInputSchema,
  stringifyToolResult,
} from './utils';

export async function executeMCPClient(
  runtime: MCPClientNodeRuntime,
  tool: Pick<AgentToolBinding, 'publicName' | 'sourceToolName'>,
  args: Record<string, unknown>
): Promise<string> {
  console.log(`[MCPClient] Calling tool "${tool.publicName}" with args: ${JSON.stringify(args)}`);
  const result = await runtime.callTool(tool.sourceToolName, args);
  console.log(`[MCPClient] Tool "${tool.publicName}" returned result: ${JSON.stringify(result)}`);
  return stringifyToolResult(result);
}

export function buildToolBindingsFromCache(
  configs: MCPClientConfig[],
  cachedToolsMap: CachedMCPToolsMap
): AgentToolBinding[] {
  const bindings: AgentToolBinding[] = [];
  const usedNames = new Set<string>();

  for (const config of configs) {
    const entry = cachedToolsMap[config.nodeId];
    const tools: MCPDiscoveredTool[] = entry?.tools ?? config.cachedTools;

    for (const tool of tools) {
      const generatedName = normalizeToolName(`${tool.name}_${config.nodeId}`);
      const publicName = ensureUniqueToolName(generatedName, usedNames);
      bindings.push({
        publicName,
        sourceToolName: tool.name,
        description: tool.description,
        parameters: normalizeInputSchema(tool.inputSchema),
        endpoint: config.endpoint,
        nodeId: config.nodeId,
      });
    }
  }

  return bindings;
}
