import 'server-only';

import { randomBytes, createHash } from 'crypto';

interface OBOAuthUrlConfig {
  organizationName: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  agentId: string;
}

export interface OBOInitResult {
  authUrl: string;
  state: string;
  codeVerifier: string;
}

function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

function generateState(): string {
  return randomBytes(16).toString('base64url');
}

export function buildOBOAuthorizationUrl(config: OBOAuthUrlConfig): OBOInitResult {
  const baseUrl = `https://api.asgardeo.io/t/${config.organizationName}`;
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();
  const scope = config.scope?.trim() || 'openid';

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    requested_actor: config.agentId,
  });

  return {
    authUrl: `${baseUrl}/oauth2/authorize?${params.toString()}`,
    state,
    codeVerifier,
  };
}

export async function exchangeOBOCode(
  organizationName: string,
  clientId: string,
  redirectUri: string,
  authCode: string,
  agentAccessToken: string,
  codeVerifier: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const baseUrl = `https://api.asgardeo.io/t/${organizationName}`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code: authCode,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    actor_token: agentAccessToken,
  });

  const res = await fetch(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OBO token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error('No access_token in OBO token response');
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  };
}
