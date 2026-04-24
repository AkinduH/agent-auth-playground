import { WorkflowNode, AIAgentNodeData, MCPClientNodeData } from '../types';
import { MCPClientNodeRuntime } from '../mcpClientNode';
import { authenticateAgent } from '../agentAuth';
import { ConnectedMCPClient } from './types';

export async function initializeMCPClients(
  mcpNodes: WorkflowNode[],
  agentData?: AIAgentNodeData,
  oboTokens: Record<string, string> = {}
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
        const flow = nodeData.oauth2Flow ?? 'agent';

        if (flow === 'obo') {
          // Use the pre-obtained OBO token (user authorized in chat)
          const oboToken = oboTokens[node.id];
          if (!oboToken) {
            throw new Error(
              `[MCPClient:${node.id}] OBO token not found. User authorization is required before workflow execution.`
            );
          }
          console.log(`[MCPClient:${node.id}] Using OBO token`);
          runtime.setAccessToken(oboToken);
        } else {
          // Agent flow — authenticate using agent credentials
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
            throw new Error(
              `[MCPClient:${node.id}] Agent ID is required on the connected AI Agent node for OAuth2`
            );
          }
          if (!agentData?.agentSecret?.trim()) {
            throw new Error(
              `[MCPClient:${node.id}] Agent Secret is required on the connected AI Agent node for OAuth2`
            );
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
      }

      console.log(`[MCPClient:${node.id}] Connecting to ${endpoint}`);
      await runtime.connect(endpoint);
      console.log(`[MCPClient:${node.id}] Connected`);

      return { endpoint, nodeId: node.id, runtime };
    })
  );
}
