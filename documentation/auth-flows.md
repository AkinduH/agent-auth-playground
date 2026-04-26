# Authentication Flows

Auth Playground supports two OAuth2 authentication flows for MCP Client nodes. Both use **PKCE (Proof Key for Code Exchange)** and are implemented against [Asgardeo](https://wso2.com/asgardeo/) as the identity provider.

---

## When Is Authentication Used?

Authentication only applies when an MCP Client node has **Use MCP OAuth2** toggled on. Without it, MCP connections are unauthenticated.

---

## Agent OAuth2 Flow

### What It Does

The agent authenticates with its own service-account credentials (Agent ID + Agent Secret) to obtain an access token. No user interaction is required. The token is used for all MCP tool calls made by the agent.

### Use Case

- The MCP server is a protected API.
- The agent acts autonomously — no user identity needs to be forwarded.
- Example: A background automation agent that calls a ticketing system API.

### Prerequisites

On the **MCP Client** node:
- `useOAuth2: true`
- `oauth2Flow: agent`
- `oauth2OrganizationName` — Asgardeo tenant (e.g., `my-company`)
- `oauth2ClientId` — OAuth2 application client ID
- `oauth2RedirectUri` — Registered callback URL
- `oauth2Scope` — Requested scopes (default: `openid`)

On the connected **AI Agent** node:
- `agentId` — service account username
- `agentSecret` — service account password

### Flow Diagram

```
Agent                Asgardeo IAM              MCP Server
  │                       │                        │
  │── POST /oauth2/authorize ─────────────────▶   │
  │   (client_id, code_challenge, S256)            │
  │◀─ { flowId, authenticatorId } ────────────    │
  │                       │                        │
  │── POST /oauth2/authn ──────────────────────▶  │
  │   (flowId, username=agentId, password=secret)  │
  │◀─ { code } ────────────────────────────────   │
  │                       │                        │
  │── POST /oauth2/token ──────────────────────▶  │
  │   (code, code_verifier, client_id)             │
  │◀─ { access_token } ────────────────────────   │
  │                       │                        │
  │─────── tool call ──────────────────────────▶  │
  │        Authorization: Bearer <access_token>    │
```

### Technical Implementation

**File:** `lib/agentAuth.ts` → `authenticateAgent(config)`

#### Step 1 — Generate PKCE

```
code_verifier  = 48 random bytes, base64url-encoded
code_challenge = SHA-256(code_verifier), base64url-encoded
```

#### Step 2 — Initiate Authorization

```
POST https://api.asgardeo.io/t/{organizationName}/oauth2/authorize

Body (application/x-www-form-urlencoded):
  client_id          = oauth2ClientId
  response_type      = code
  redirect_uri       = oauth2RedirectUri
  scope              = oauth2Scope
  response_mode      = direct
  code_challenge     = <code_challenge>
  code_challenge_method = S256

Response (JSON):
  { flowId: "...", nextStep: { authenticators: [{ authenticatorId: "..." }] } }
```

#### Step 3 — Submit Credentials

```
POST https://api.asgardeo.io/t/{organizationName}/oauth2/authn

Body (JSON):
  {
    "flowId": "...",
    "selectedAuthenticator": {
      "authenticatorId": "...",
      "params": {
        "username": "<agentId>",
        "password": "<agentSecret>"
      }
    }
  }

Response (JSON):
  { authData: { code: "..." } }
```

#### Step 4 — Exchange Code for Token

```
POST https://api.asgardeo.io/t/{organizationName}/oauth2/token

Body (application/x-www-form-urlencoded):
  grant_type    = authorization_code
  client_id     = oauth2ClientId
  code          = <authCode from step 3>
  code_verifier = <code_verifier from step 1>
  redirect_uri  = oauth2RedirectUri

Response (JSON):
  { access_token: "eyJ...", token_type: "Bearer", expires_in: 3600, ... }
```

The `access_token` is then set as the `Authorization: Bearer` header on all subsequent MCP HTTP calls.

---

## OBO (On-Behalf-Of) Flow

### What It Does

The agent acts on behalf of a real user. The user must log in to Asgardeo and grant explicit consent for the agent to access resources on their behalf. The resulting token carries the user's identity and is forwarded to the MCP server.

### Use Case

- The MCP server enforces per-user authorization (e.g., "only the booking owner can modify a reservation").
- The request must be traceable to a specific human user.
- Example: A travel-booking agent that reads and modifies a user's own bookings.

### Prerequisites

Same as the Agent Flow, plus:
- A registered redirect URI that is accessible by the user's browser (for the callback).
- The Asgardeo application must support the `requested_actor` parameter (actor token flow).

### Flow Diagram

```
User       App (Browser)        Asgardeo IAM          Agent (Server)      MCP Server
  │              │                    │                     │                   │
  │── send ────▶ │                    │                     │                   │
  │   message    │                    │                     │                   │
  │              │── POST /api/obo/init ─────────────────▶ │                   │
  │              │                    │◀── agent OAuth2 ──▶ │                   │
  │              │                    │   (3-step PKCE)     │                   │
  │              │◀─ { authUrl, agentToken } ──────────────│                   │
  │              │                    │                     │                   │
  │◀── Show ────▶│                    │                     │                   │
  │   Authorize  │                    │                     │                   │
  │   button     │                    │                     │                   │
  │              │                    │                     │                   │
  │── click ───▶ popup                │                     │                   │
  │              │                    │                     │                   │
  │── GET /oauth2/authorize ─────────▶│                     │                   │
  │   (requested_actor=agentId)       │                     │                   │
  │              │                    │                     │                   │
  │  [Login + Consent screen]         │                     │                   │
  │              │                    │                     │                   │
  │── grant ───▶ │── IAM redirects──▶ redirect page         │                   │
  │   consent    │   code + state     │                     │                   │
  │              │                    │                     │                   │
  │              │── BroadcastChannel('obo-callback') ─────│                   │
  │              │   { code, state }  │                     │                   │
  │              │                    │                     │                   │
  │              │── POST /api/obo/exchange ───────────────▶│                   │
  │              │   (code + agentToken)                    │                   │
  │              │                    │◀── /oauth2/token ──▶│                   │
  │              │                    │   (actor_token=agentToken)              │
  │              │◀─ { accessToken } ──────────────────────│                   │
  │              │                    │                     │                   │
  │              │── POST /api/execute-workflow ──────────▶│                   │
  │              │   (oboTokens: { nodeId: oboToken })      │                   │
  │              │                    │                     │── tool call ─────▶│
  │              │                    │                     │   Authorization: Bearer <oboToken>
  │              │                    │                     │◀─ result ─────────│
  │              │◀────────────────────────────────────────│                   │
```

### Technical Implementation

**Files:** `lib/oboAuth.ts`, `app/api/obo/init/route.ts`, `app/api/obo/exchange/route.ts`

#### Step 1 — Initialize (Server)

`POST /api/obo/init`

```json
Request:
{
  "organizationName": "my-company",
  "clientId": "vMH8K3zdI...",
  "redirectUri": "https://example.com/callback",
  "scope": "openid read_bookings",
  "agentId": "agent-service-account",
  "agentSecret": "super-secret"
}

Response:
{
  "authUrl": "https://api.asgardeo.io/t/my-company/oauth2/authorize?...",
  "state": "<random 16-byte base64url>",
  "codeVerifier": "<48-byte base64url>",
  "agentAccessToken": "eyJ..."
}
```

The server:
1. Runs the Agent OAuth2 flow to get the `agentAccessToken`.
2. Generates a new PKCE pair (`codeVerifier`, `codeChallenge`) for the user flow.
3. Builds the authorization URL with `requested_actor=agentId` — this parameter is critical; it tells Asgardeo that this user is delegating to the specified agent.

#### Step 2 — User Consent (Browser)

The app opens `authUrl` in a popup. The user:
1. Logs in with their personal credentials.
2. Reviews the consent screen: "Allow `{agentId}` to act on your behalf?"
3. Grants or denies.

On grant, Asgardeo redirects the popup to `redirectUri?code=...&state=...`.

The redirect page posts on `BroadcastChannel('obo-callback')`:
```json
{ "code": "auth-code-from-iam", "state": "state-value" }
```

The main window listens for this message to continue the flow.

#### Step 3 — Token Exchange (Server)

`POST /api/obo/exchange`

```json
Request:
{
  "authCode": "...",
  "agentAccessToken": "eyJ...",
  "codeVerifier": "...",
  "organizationName": "my-company",
  "clientId": "vMH8K3zdI...",
  "redirectUri": "https://example.com/callback"
}
```

The server calls Asgardeo token endpoint with an additional `actor_token` parameter:

```
POST /oauth2/token

grant_type    = authorization_code
client_id     = oauth2ClientId
code          = <authCode>
redirect_uri  = oauth2RedirectUri
code_verifier = <code_verifier>
actor_token   = <agentAccessToken>    ← key difference from agent flow
```

This produces an OBO token that carries both the user's identity and the agent's identity.

```json
Response:
{ "accessToken": "eyJ...", "expiresIn": 3600 }
```

#### Step 4 — Token Storage

The OBO token is stored in `localStorage`:

```
Key: 'oboTokens'
Value: {
  "{workflowId}_{nodeId}": {
    "accessToken": "eyJ...",
    "expiresAt": 1714123456789
  }
}
```

On subsequent messages, the app checks if the token is still valid (`Date.now() < expiresAt`). If expired, the consent flow restarts.

---

## Comparing the Two Flows

| Aspect | Agent Flow | OBO Flow |
|--------|-----------|---------|
| User interaction | None | User must log in and grant consent |
| Token represents | The agent | The user, delegated to the agent |
| Reusable across sessions | No (token not stored) | Yes (stored in `localStorage` until expiry) |
| Required for | Autonomous automation | User-specific resource access |
| `actor_token` in exchange | No | Yes |
| `requested_actor` in auth URL | No | Yes |

---

## Security Considerations

- **Agent Secret** is stored in the browser's `localStorage` as part of the workflow definition. Use caution in shared environments.
- **OBO tokens** are stored in `localStorage` with their expiry time. They are cleared when the workflow is deleted or when `clearOBOTokens()` is called.
- **PKCE** is used for all flows, so no client secret is needed. The `code_verifier` is ephemeral (not persisted).
- The `previewToken()` helper truncates tokens for display in logs and the auth flow diagram UI — full tokens are never shown in the UI.

---

## Asgardeo Setup Checklist

Before using OAuth2 flows, ensure your Asgardeo application is configured with:

- [ ] Application type: **Standard-Based Application** (OAuth2/OIDC)
- [ ] Allowed grant types: **Authorization Code**
- [ ] PKCE: **Mandatory** (with `S256` challenge method)
- [ ] Callback URL: your `redirectUri`
- [ ] `response_mode=direct` support enabled
- [ ] For OBO: `requested_actor` parameter support enabled in the tenant
- [ ] Agent service account created with the `agentId` and `agentSecret` you configure in the node
