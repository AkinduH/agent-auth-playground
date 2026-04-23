// Implements the 3-step agent-acting-on-its-own authentication flow against Asgardeo using PKCE.
//
// Step 1: POST /oauth2/authorize  → send code_challenge, get flowId
// Step 2: POST /oauth2/authn      → submit agent credentials → get authorization code
// Step 3: POST /oauth2/token      → exchange code + code_verifier for access token (no client_secret)

import { randomBytes, createHash } from 'crypto';

const {
  ORGANIZATION_NAME,
  CLIENT_ID,
  AGENT_ID,
  AGENT_SECRET,
  REDIRECT_URI,
  SCOPE,
} = process.env as Record<string, string>;

const BASE_URL = `https://api.asgardeo.io/t/${ORGANIZATION_NAME}`;

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

function generatePKCE(): PKCEPair {
  const codeVerifier = randomBytes(48).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// Step 1 — Initiate the authorization flow with PKCE and retrieve the flowId.
async function initiateAuthorize(codeChallenge: string, scope: string): Promise<AuthorizeResult> {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope,
    response_mode: 'direct',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const res = await fetch(`${BASE_URL}/oauth2/authorize`, {
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

  // Pick the first available authenticator from the response.
  const authenticatorId = data.nextStep?.authenticators?.[0]?.authenticatorId;
  if (!authenticatorId) {
    throw new Error('No authenticator found in authorize response');
  }

  return { flowId: data.flowId, authenticatorId };
}

// Step 2 — Submit agent credentials to the authn endpoint and get an authorization code.
async function submitCredentials(flowId: string, authenticatorId: string): Promise<string> {
  const payload = {
    flowId,
    selectedAuthenticator: {
      authenticatorId,
      params: {
        username: AGENT_ID,
        password: AGENT_SECRET,
      },
    },
  };

  const res = await fetch(`${BASE_URL}/oauth2/authn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Authn failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as AuthnResponse;

  const code = data.authData?.code;
  if (!code) {
    throw new Error(`No code in authn response: ${JSON.stringify(data)}`);
  }

  return code;
}

// Step 3 — Exchange the authorization code + code_verifier for an access token (PKCE, no secret).
async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<unknown> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    redirect_uri: REDIRECT_URI,
  });

  const res = await fetch(`${BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

// Orchestrates all three steps and returns the token response.
// additionalScopes: extra space-separated scopes to append to the base SCOPE from .env
export async function authenticateAgent(additionalScopes = ''): Promise<unknown> {
  const scope = [SCOPE, additionalScopes].filter(Boolean).join(' ');
  const { codeVerifier, codeChallenge } = generatePKCE();
  const { flowId, authenticatorId } = await initiateAuthorize(codeChallenge, scope);
  const code = await submitCredentials(flowId, authenticatorId);
  const tokenResponse = await exchangeCodeForToken(code, codeVerifier);
  return tokenResponse;
}