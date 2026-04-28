import { MCPClientNodeRuntime } from '../mcpClientNode';
import { authenticateAgent } from '../agentAuth';
import { MCPClientConfig, ConsentRequiredError } from './types';
import { WorkflowTrace, MCPNodeTrace, deriveIamUrls } from '../authTrace';

export async function connectMCPClient(
  config: MCPClientConfig,
  oboTokens: Record<string, string>,
  trace?: WorkflowTrace
): Promise<MCPClientNodeRuntime> {
  const { nodeId, endpoint, nodeData, agentData, cachedTools } = config;
  const runtime = new MCPClientNodeRuntime();

  const traceEntry: MCPNodeTrace = {
    nodeId,
    name: nodeData.name?.trim() || undefined,
    endpoint,
    flow: 'none',
    agentId: agentData.agentId,
  };

  if (nodeData.useOAuth2) {
    const flow = nodeData.oauth2Flow ?? 'agent';

    if (flow === 'obo') {
      const oboToken = oboTokens[nodeId];
      if (!oboToken) {
        throw new ConsentRequiredError(nodeId);
      }
      console.log(`[MCPClient:${nodeId}] Using OBO token`);
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
        throw new Error(`[MCPClient:${nodeId}] OAuth2 organization name is required`);
      }
      if (!nodeData.oauth2ClientId?.trim()) {
        throw new Error(`[MCPClient:${nodeId}] OAuth2 client ID is required`);
      }
      if (!nodeData.oauth2RedirectUri?.trim()) {
        throw new Error(`[MCPClient:${nodeId}] OAuth2 redirect URI is required`);
      }
      if (!agentData.agentId?.trim()) {
        throw new Error(`[MCPClient:${nodeId}] Agent ID is required on the connected AI Agent node for OAuth2`);
      }
      if (!agentData.agentSecret?.trim()) {
        throw new Error(`[MCPClient:${nodeId}] Agent Secret is required on the connected AI Agent node for OAuth2`);
      }

      console.log(`[MCPClient:${nodeId}] Running OAuth2 agent authentication flow`);
      const accessToken = await authenticateAgent({
        organizationName: nodeData.oauth2OrganizationName,
        clientId: nodeData.oauth2ClientId,
        redirectUri: nodeData.oauth2RedirectUri,
        agentId: agentData.agentId,
        agentSecret: agentData.agentSecret,
        scope: nodeData.oauth2Scope,
      });
      runtime.setAccessToken(accessToken);
      console.log(`[MCPClient:${nodeId}] Access token obtained`);

      const urls = deriveIamUrls(nodeData.oauth2OrganizationName.trim());
      traceEntry.flow = 'agent';
      traceEntry.iamBaseUrl = urls.iamBaseUrl;
      traceEntry.authorizeUrl = urls.authorizeUrl;
      traceEntry.authnUrl = urls.authnUrl;
      traceEntry.tokenUrl = urls.tokenUrl;
      traceEntry.agentToken = accessToken;
    }
  }

  console.log(`[MCPClient:${nodeId}] Connecting to ${endpoint} with ${cachedTools.length} cached tools`);
  await runtime.connect(endpoint, { cachedTools });
  console.log(`[MCPClient:${nodeId}] Connected`);

  if (trace) trace.mcps.push(traceEntry);

  return runtime;
}
