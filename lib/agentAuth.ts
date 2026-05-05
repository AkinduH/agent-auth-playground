import 'server-only';

import { randomBytes, createHash } from 'crypto';
import { AuthErrorStage, parseOAuthErrorBody } from './authTrace';

export interface AgentAuthConfig {
  baseUrl: string;
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
  flowStatus?: string;
  failureReason?: string;
  error?: string;
  error_description?: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  [key: string]: unknown;
}

export interface AuthFlowErrorInit {
  stage: AuthErrorStage;
  statusCode?: number;
  errorCode?: string;
  errorDescription?: string;
  url?: string;
  body?: string;
  message?: string;
}

export class AuthFlowError extends Error {
  stage: AuthErrorStage;
  statusCode?: number;
  errorCode?: string;
  errorDescription?: string;
  url?: string;
  body?: string;

  constructor(init: AuthFlowErrorInit) {
    const headline =
      init.message ||
      init.errorDescription ||
      init.errorCode ||
      `${init.stage} failed${init.statusCode ? ` (HTTP ${init.statusCode})` : ''}`;
    super(headline);
    this.name = 'AuthFlowError';
    this.stage = init.stage;
    this.statusCode = init.statusCode;
    this.errorCode = init.errorCode;
    this.errorDescription = init.errorDescription;
    this.url = init.url;
    this.body = init.body;
  }
}

function generatePKCE(): PKCEPair {
  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

async function readErrorBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function initiateAuthorize(
  baseUrl: string,
  clientId: string,
  redirectUri: string,
  scope: string,
  codeChallenge: string
): Promise<AuthorizeResult> {
  const url = `${baseUrl}/oauth2/authorize`;
  const body = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope,
    response_mode: 'direct',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const text = await readErrorBody(res);
    const parsed = parseOAuthErrorBody(text);
    throw new AuthFlowError({
      stage: 'authorize',
      statusCode: res.status,
      url,
      body: text,
      errorCode: parsed.errorCode,
      errorDescription: parsed.errorDescription,
      message: parsed.errorDescription || parsed.errorCode || `Authorize failed (${res.status})`,
    });
  }

  const data = (await res.json()) as AuthorizeResponse;

  if (!data.flowId) {
    throw new AuthFlowError({
      stage: 'authorize',
      statusCode: res.status,
      url,
      errorCode: 'missing_flow_id',
      errorDescription: 'Authorize response did not contain a flowId',
      body: JSON.stringify(data),
    });
  }

  const authenticatorId = data.nextStep?.authenticators?.[0]?.authenticatorId;
  if (!authenticatorId) {
    throw new AuthFlowError({
      stage: 'authorize',
      statusCode: res.status,
      url,
      errorCode: 'no_authenticator',
      errorDescription: 'Authorize response did not contain an authenticator',
      body: JSON.stringify(data),
    });
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
  const url = `${baseUrl}/oauth2/authn`;
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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await readErrorBody(res);
    const parsed = parseOAuthErrorBody(text);
    throw new AuthFlowError({
      stage: 'authn',
      statusCode: res.status,
      url,
      body: text,
      errorCode: parsed.errorCode || (res.status === 401 ? 'invalid_credentials' : undefined),
      errorDescription:
        parsed.errorDescription ||
        (res.status === 401 ? 'Agent ID or secret was rejected by the IAM' : undefined),
      message: parsed.errorDescription || parsed.errorCode || `Authn failed (${res.status})`,
    });
  }

  const data = (await res.json()) as AuthnResponse;

  // Asgardeo can return 200 OK with a FAIL_INCOMPLETE / INCOMPLETE flow status
  // when credentials don't pass. Detect those cases too.
  if (data.flowStatus && data.flowStatus !== 'SUCCESS_COMPLETED') {
    throw new AuthFlowError({
      stage: 'authn',
      statusCode: res.status,
      url,
      body: JSON.stringify(data),
      errorCode: data.error || data.flowStatus,
      errorDescription:
        data.error_description || data.failureReason || `Authn rejected: ${data.flowStatus}`,
    });
  }

  const code = data.authData?.code ?? data.code;
  if (!code) {
    throw new AuthFlowError({
      stage: 'authn',
      statusCode: res.status,
      url,
      body: JSON.stringify(data),
      errorCode: 'no_authorization_code',
      errorDescription: 'Authn succeeded but no authorization code was returned',
    });
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
  const url = `${baseUrl}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await readErrorBody(res);
    const parsed = parseOAuthErrorBody(text);
    throw new AuthFlowError({
      stage: 'token',
      statusCode: res.status,
      url,
      body: text,
      errorCode: parsed.errorCode,
      errorDescription: parsed.errorDescription,
      message: parsed.errorDescription || parsed.errorCode || `Token exchange failed (${res.status})`,
    });
  }

  return res.json() as Promise<TokenResponse>;
}

export async function authenticateAgent(config: AgentAuthConfig): Promise<string> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
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
    throw new AuthFlowError({
      stage: 'token',
      url: `${baseUrl}/oauth2/token`,
      errorCode: 'no_access_token',
      errorDescription: 'Token endpoint returned 200 but no access_token field',
      body: JSON.stringify(tokenResponse),
    });
  }

  return tokenResponse.access_token;
}
