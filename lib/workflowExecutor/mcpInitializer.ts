import { WorkflowNode, AIAgentNodeData, MCPClientNodeData } from '../types';
import { MCPClientNodeRuntime } from '../mcpClientNode';
import { authenticateAgent } from '../agentAuth';
import { ConnectedMCPClient } from './types';
import { WorkflowTrace, MCPNodeTrace, deriveIamUrls } from '../authTrace';

export async function initializeMCPClients(
  mcpNodes: WorkflowNode[],
  agentData?: AIAgentNodeData,
  oboTokens: Record<string, string> = {},
  trace?: WorkflowTrace
): Promise<ConnectedMCPClient[]> {
  return Promise.all(
    mcpNodes.map(async (node) => {
      const nodeData = node.data as MCPClientNodeData;
      const endpoint = nodeData.mcpServerEndpoint?.trim();

      if (!endpoint) {
        throw new Error(`[MCPClient:${node.id}] Missing server endpoint`);
      }

      const runtime = new MCPClientNodeRuntime();

      const traceEntry: MCPNodeTrace = {
        nodeId: node.id,
        name: nodeData.name?.trim() || undefined,
        endpoint,
        flow: 'none',
        agentId: agentData?.agentId,
      };

      if (nodeData.useOAuth2) {
        const flow = nodeData.oauth2Flow ?? 'agent';

        if (flow === 'obo') {
          const oboToken = oboTokens[node.id];
          if (!oboToken) {
            throw new Error(
              `[MCPClient:${node.id}] OBO token not found. User authorization is required before workflow execution.`
            );
          }
          console.log(`[MCPClient:${node.id}] Using OBO token`);
          runtime.setAccessToken(oboToken);

          traceEntry.flow = 'obo';
          traceEntry.oboToken = oboToken;
          if (nodeData.oauth2OrganizationName?.trim()) {
            const urls = deriveIamUrls(nodeData.oauth2OrganizationName.trim());
            traceEntry.iamBaseUrl = urls.iamBaseUrl;
            traceEntry.authorizeUrl = urls.authorizeUrl;
            traceEntry.tokenUrl = urls.tokenUrl;
          }
        } else {
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

          const urls = deriveIamUrls(nodeData.oauth2OrganizationName.trim());
          traceEntry.flow = 'agent';
          traceEntry.iamBaseUrl = urls.iamBaseUrl;
          traceEntry.authorizeUrl = urls.authorizeUrl;
          traceEntry.authnUrl = urls.authnUrl;
          traceEntry.tokenUrl = urls.tokenUrl;
          traceEntry.agentToken = accessToken;
        }
      }

      console.log(`[MCPClient:${node.id}] Connecting to ${endpoint}`);
      await runtime.connect(endpoint);
      console.log(`[MCPClient:${node.id}] Connected`);

      if (trace) trace.mcps.push(traceEntry);

      return { endpoint, nodeId: node.id, runtime };
    })
  );
}
