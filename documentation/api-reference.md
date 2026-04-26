# API Reference

Auth Playground exposes three API routes used internally by the frontend. They are Next.js App Router route handlers located under `app/api/`.

---

## POST /api/execute-workflow

Executes a workflow for a given user input. Returns a Server-Sent Events stream.

### Request

```
POST /api/execute-workflow
Content-Type: application/json
```

```typescript
{
  workflow: {
    id: string
    name: string
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
  }
  input: string                              // user's message
  workflowId: string
  apiKeys: {
    gemini?: string
    openai?: string
    anthropic?: string
  }
  memoryMessages?: ChatMessage[]            // last N messages for memory context
  oboTokens?: Record<string, string>        // nodeId → access token
}
```

### Response

`Content-Type: text/event-stream`

Sequence of SSE events:

```
data: {"type":"node-start","nodeId":"..."}

data: {"type":"node-end","nodeId":"..."}

...

data: {"type":"result","success":true,"output":"...","executionTime":1234,"trace":{...}}
```

Or on failure:

```
data: {"type":"result","success":false,"error":"...","executionTime":12,"trace":{...}}
```

### Error Scenarios

All errors are returned as SSE `result` frames with `success: false`. HTTP status is always `200` for the stream itself.

| Condition | Error message |
|-----------|--------------|
| Missing `workflow` or `input` | `"Missing workflow or input"` |
| Malformed JSON body | `"Invalid request body"` |
| Workflow validation failure | `"Invalid workflow: {comma-separated errors}"` |
| Node execution failure | The original exception message |

### Timeout

60 seconds. Configured as `maxDuration = 60` on the route segment.

---

## POST /api/execute-llm

Executes a single LLM call. Used internally by the WorkflowExecutor; can also be called independently for testing.

### Request

```
POST /api/execute-llm
Content-Type: application/json
```

```typescript
{
  provider: 'openai' | 'gemini' | 'anthropic'
  model: string
  message: string
  systemPrompt: string
  temperature: number          // 0 – 2
  maxTokens: number            // 1 – 4000
  apiKey: string
}
```

### Response

```json
{ "success": true, "output": "The LLM's response text" }
```

Or:

```json
{ "success": false, "error": "No API key provided" }
```

### Error Scenarios

| Condition | Status | Error |
|-----------|--------|-------|
| Missing required fields | 400 | `"Missing required fields"` |
| No API key | 400 | `"No API key provided"` |
| Unknown provider | 400 | `"Unknown provider: {provider}"` |
| API call fails | 500 | The provider error message |

---

## POST /api/obo/init

Initializes an OBO (On-Behalf-Of) consent flow. Authenticates the agent and returns the authorization URL for the user consent popup.

### Request

```
POST /api/obo/init
Content-Type: application/json
```

```typescript
{
  organizationName: string     // Asgardeo tenant
  clientId: string
  redirectUri: string
  scope?: string               // defaults to 'openid'
  agentId: string
  agentSecret: string
}
```

### Response

```json
{
  "authUrl": "https://api.asgardeo.io/t/my-org/oauth2/authorize?...",
  "state": "<random 16-byte base64url>",
  "codeVerifier": "<48-byte base64url>",
  "agentAccessToken": "eyJ..."
}
```

The `agentAccessToken` is the result of the agent's own OAuth2 authentication. It is needed as the `actor_token` in the subsequent exchange step.

The `authUrl` must be opened in a browser popup for the user consent screen.

### Error Scenarios

| Condition | Status | Error |
|-----------|--------|-------|
| Missing required fields | 400 | `"Missing required fields"` |
| Agent authentication fails | 500 | The Asgardeo error |

---

## POST /api/obo/exchange

Exchanges an authorization code (from the user consent popup) for an OBO access token.

### Request

```
POST /api/obo/exchange
Content-Type: application/json
```

```typescript
{
  authCode: string             // code from the Asgardeo callback
  agentAccessToken: string     // token from /api/obo/init
  codeVerifier: string         // verifier from /api/obo/init
  organizationName: string
  clientId: string
  redirectUri: string
}
```

### Response

```json
{
  "accessToken": "eyJ...",
  "expiresIn": 3600
}
```

The `accessToken` is the OBO token. It should be stored in `localStorage` and passed to `/api/execute-workflow` via `oboTokens`.

### Error Scenarios

| Condition | Status | Error |
|-----------|--------|-------|
| Missing required fields | 400 | `"Missing required fields"` |
| Asgardeo token exchange fails | 500 | The Asgardeo error |

---

## WorkflowNode Type Reference

```typescript
type WorkflowNode = {
  id: string
  type: 'chatTrigger' | 'aiAgent' | 'llm' | 'mcpClient'
  position: { x: number; y: number }
  data: ChatTriggerNodeData | AIAgentNodeData | LLMNodeData | MCPClientNodeData
}

type ChatTriggerNodeData = {
  label: 'Chat Trigger'
}

type AIAgentNodeData = {
  label: 'AI Agent'
  systemPrompt?: string          // default: 'You are a helpful assistant.'
  agentName?: string
  agentId?: string
  agentSecret?: string
  temperature?: number           // default: 0.7
  maxTokens?: number             // default: 1000
  maxToolSteps?: number          // default: 6, range: 1–12
  maxMessages?: number           // range: 1–100, optional
}

type LLMNodeData = {
  label: 'AI Service'
  provider: 'openai' | 'gemini' | 'anthropic'
  model: string
  temperature?: number           // default: 0.7
  maxTokens?: number             // default: 1000
  systemPrompt?: string
}

type MCPClientNodeData = {
  label: 'MCP Client'
  name?: string
  mcpServerEndpoint: string      // required
  useOAuth2?: boolean            // default: false
  oauth2Flow?: 'agent' | 'obo'  // default: 'agent'
  oauth2OrganizationName?: string
  oauth2ClientId?: string
  oauth2RedirectUri?: string
  oauth2Scope?: string           // default: 'openid'
}
```

---

## WorkflowEdge Type Reference

```typescript
type WorkflowEdge = {
  id: string
  source: string           // source node ID
  target: string           // target node ID
  sourceHandle?: string    // 'top' | 'right' | null
  targetHandle?: string    // 'bottom' | 'left' | null
}
```

---

## ChatMessage Type Reference

```typescript
type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  workflowId?: string
  type?: string
  metadata?: Record<string, unknown>
}
```
