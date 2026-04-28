export type AuthFlowKind = 'agent' | 'obo' | 'mixed' | 'none';

export interface MCPNodeTrace {
  nodeId: string;
  name?: string;
  endpoint: string;
  flow: AuthFlowKind;
  iamBaseUrl?: string;
  authorizeUrl?: string;
  authnUrl?: string;
  tokenUrl?: string;
  oboAuthUrl?: string;
  agentToken?: string;
  oboToken?: string;
  agentId?: string;
}

export interface ToolCallTrace {
  step: number;
  publicName: string;
  sourceToolName: string;
  endpoint: string;
  nodeId: string;
  args: string;
  result: string;
  ok: boolean;
}

export interface WorkflowTrace {
  flow: AuthFlowKind;
  startedAt: number;
  finishedAt?: number;
  userMessage?: string;
  finalAnswer?: string;
  llm?: { provider: string; model: string };
  mcps: MCPNodeTrace[];
  tools: ToolCallTrace[];
}

export function emptyTrace(): WorkflowTrace {
  return { flow: 'none', startedAt: Date.now(), mcps: [], tools: [] };
}

export function previewToken(token?: string, headLen = 10, tailLen = 4): string {
  if (!token) return '—';
  if (token.length <= headLen + tailLen + 2) return token;
  return `${token.slice(0, headLen)}…${token.slice(-tailLen)}`;
}

export function deriveIamUrls(organizationName: string): {
  iamBaseUrl: string;
  authorizeUrl: string;
  authnUrl: string;
  tokenUrl: string;
} {
  const iamBaseUrl = `https://api.asgardeo.io/t/${organizationName}`;
  return {
    iamBaseUrl,
    authorizeUrl: `${iamBaseUrl}/oauth2/authorize`,
    authnUrl: `${iamBaseUrl}/oauth2/authn`,
    tokenUrl: `${iamBaseUrl}/oauth2/token`,
  };
}

export function dominantFlow(mcps: MCPNodeTrace[]): AuthFlowKind {
  const hasAgent = mcps.some((m) => m.flow === 'agent');
  const hasObo = mcps.some((m) => m.flow === 'obo');
  if (hasAgent && hasObo) return 'mixed';
  if (hasObo) return 'obo';
  if (hasAgent) return 'agent';
  return 'none';
}
