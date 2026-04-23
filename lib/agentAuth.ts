import 'server-only';

import { randomBytes, createHash } from 'crypto';

export interface AgentAuthConfig {
  organizationName: string;
  clientId: string;
  redirectUri: string;
  agentId: string;
  agentSecret: string;
  scope?: string;
}

interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
}

interface AuthorizeResult {
  flowId: string;
  authenticatorId: string;
}

interface AuthorizeResponse {
  flowId?: string;
  nextStep?: {
    authenticators?: Array<{ authenticatorId: string }>;
  };
}

interface AuthnResponse {
  authData?: { code?: string };
  code?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  [key: string]: unknown;
}

function generatePKCE(): PKCEPair {
  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

async function initiateAuthorize(
  baseUrl: string,
  clientId: string,
  redirectUri: string,
  scope: string,
  codeChallenge: string
): Promise<AuthorizeResult> {
  const body = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope,
    response_mode: 'direct',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const res = await fetch(`${baseUrl}/oauth2/authorize`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Authorize failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as AuthorizeResponse;

  if (!data.flowId) {
    throw new Error(`No flowId in authorize response: ${JSON.stringify(data)}`);
  }

  const authenticatorId = data.nextStep?.authenticators?.[0]?.authenticatorId;
  if (!authenticatorId) {
    throw new Error('No authenticator found in authorize response');
  }

  return { flowId: data.flowId, authenticatorId };
}

async function submitCredentials(
  baseUrl: string,
  flowId: string,
  authenticatorId: string,
  agentId: string,
  agentSecret: string
): Promise<string> {
  const payload = {
    flowId,
    selectedAuthenticator: {
      authenticatorId,
      params: {
        username: agentId,
        password: agentSecret,
      },
    },
  };

  const res = await fetch(`${baseUrl}/oauth2/authn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Authn failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as AuthnResponse;

  const code = data.authData?.code ?? data.code;
  if (!code) {
    throw new Error(`No code in authn response: ${JSON.stringify(data)}`);
  }

  return code;
}

async function exchangeCodeForToken(
  baseUrl: string,
  clientId: string,
  redirectUri: string,
  code: string,
  codeVerifier: string
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export async function authenticateAgent(config: AgentAuthConfig): Promise<string> {
  const baseUrl = `https://api.asgardeo.io/t/${config.organizationName}`;
  const scope = config.scope?.trim() || 'openid';

  const { codeVerifier, codeChallenge } = generatePKCE();
  const { flowId, authenticatorId } = await initiateAuthorize(
    baseUrl,
    config.clientId,
    config.redirectUri,
    scope,
    codeChallenge
  );
  const code = await submitCredentials(baseUrl, flowId, authenticatorId, config.agentId, config.agentSecret);
  const tokenResponse = await exchangeCodeForToken(baseUrl, config.clientId, config.redirectUri, code, codeVerifier);

  if (!tokenResponse.access_token) {
    throw new Error(`No access_token in token response: ${JSON.stringify(tokenResponse)}`);
  }

  return tokenResponse.access_token;
}
