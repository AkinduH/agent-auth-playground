# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install     # Install dependencies (use pnpm, not npm — pnpm-lock.yaml is the lockfile)
pnpm dev         # Start Next.js development server
pnpm build       # Production build
pnpm lint        # ESLint
```

No test framework is configured. TypeScript build errors are suppressed via `ignoreBuildErrors: true` in [next.config.mjs](next.config.mjs).

## Architecture

**Auth Playground** is a visual, browser-based AI workflow builder. Users design workflows by connecting nodes on a React Flow canvas, then test them via a chat panel on the right. All workflow state persists in browser `localStorage`; there is no database.

### Node Types

| Node | Role |
|------|------|
| `ChatTrigger` | Entry point — receives the user's chat message |
| `LLM` | Direct call to OpenAI, Gemini, or Anthropic |
| `AIAgent` | Agentic loop with tool-calling; consumes tools from connected MCP nodes. Has `agentId`/`agentSecret` fields for OAuth2 |
| `MCPClient` | Connects to an MCP server, discovers tools; optionally authenticates via OAuth2 (`useOAuth2` flag) |

### Handle/Connection Rules

React Flow enforces connection constraints in [components/WorkflowEditor.tsx](components/WorkflowEditor.tsx):

- **AIAgent** has two source handles: `top` (connects only to `LLM` nodes) and `right` (connects only to `MCPClient` nodes)
- **ChatTrigger** has one `source` handle on the right
- **LLM** has one `target` handle on the bottom
- **MCPClient** has one `target` handle on the left

### Node Configuration Fields

**AIAgentNodeData**: `systemPrompt`, `temperature`, `maxTokens`, `maxToolSteps` (1–12, default 6), `maxMessages` (0–100, memory window for saved history), `agentId`, `agentSecret`

**LLMNodeData**: `provider` (`'openai' | 'gemini' | 'anthropic'`), `model`, `temperature`, `maxTokens`, `systemPrompt`

**MCPClientNodeData**: `mcpServerEndpoint` (required), `useOAuth2`, `oauth2OrganizationName`, `oauth2ClientId`, `oauth2RedirectUri`, `oauth2Scope`

### Execution Flow

1. User sends a message in **ChatPanel** → `useChat.ts` calls `POST /api/execute-workflow`
2. The API route runs [lib/workflowValidation.ts](lib/workflowValidation.ts) (ChatTrigger must exist; all non-trigger nodes need edges; AIAgent must connect to an LLM; MCPClient requires `mcpServerEndpoint`), then instantiates **`WorkflowExecutor`**
3. Executor finds the `ChatTrigger` node and recursively walks connected edges via `executeNode()`
4. For AIAgent nodes, the loop runs up to `maxToolSteps` (1–12, default 6):
   - Calls LLM with the current tool list and execution history
   - Parses a JSON decision `{"type":"final"|"tool","name":"...","arguments":{}}`
   - `"tool"` → executes the named MCP tool and appends the result; `"final"` → returns
   - If the loop exhausts all steps, calls the LLM one more time without tool schemas to synthesize a final answer
5. If `MCPClientNode.useOAuth2` is enabled, `authenticateAgent()` from [lib/agentAuth.ts](lib/agentAuth.ts) runs a 3-step PKCE flow against Asgardeo before MCP connects
6. Memory context: the last `maxMessages` saved messages from `workflowMemories` are prepended as context for the agent

### Streaming Protocol (SSE)

`POST /api/execute-workflow` returns `text/event-stream`, not JSON. Each `data:` frame is a JSON `WorkflowEvent` (defined in [lib/workflowExecutor/index.ts](lib/workflowExecutor/index.ts)):

- `{ type: 'node-start', nodeId }` / `{ type: 'node-end', nodeId }` — emitted around each LLM, MCP tool call, and AIAgent execution. `useChat.ts` consumes these into `activeNodeIds` (a 1 s minimum glow window is enforced client-side and rendered by [components/nodes/ActiveBorder.tsx](components/nodes/ActiveBorder.tsx)).
- `{ type: 'result', success, output, error, executionTime, trace }` — terminal frame; treated as the final response payload.

The executor takes an optional `onEvent: WorkflowEventHandler` constructor arg; the route handler bridges it to the SSE stream. Error responses (validation failure, bad body) are still emitted as a single `result` SSE frame with `success: false`.

### Auth Tracing

[lib/authTrace.ts](lib/authTrace.ts) defines `WorkflowTrace`, `MCPNodeTrace`, and `ToolCallTrace` — a structured record of every auth step (agent OAuth2, OBO token exchange) and tool call during a run. The executor populates a `WorkflowTrace`, returns it in the terminal `result` SSE frame, and [components/AuthFlowDiagram.tsx](components/AuthFlowDiagram.tsx) renders it as a sequence diagram. `dominantFlow()` classifies the run as `'agent' | 'obo' | 'none'`; use `previewToken()` when surfacing tokens in UI or logs.

### OBO (On-Behalf-Of) Tokens

The executor accepts an `oboTokens: Record<string, string>` map (MCPClient `nodeId` → access token). When present, the MCP call forwards the user's OBO token instead of the agent's client-credentials token. `useChat.ts` manages an in-UI consent handshake (`oboConsentPending`); when the server requests consent, the user approves and the token is patched into the next workflow request.

The OBO flow uses PKCE: `lib/oboAuth.ts` provides `buildOBOAuthorizationUrl()` (generates an auth URL embedding the agent's access token as the actor) and `exchangeOBOCode()` (exchanges the auth code + code verifier for a user-scoped token). The API routes `POST /api/obo/init` and `POST /api/obo/exchange` expose this flow to the client.

### Rate Limiting

[proxy.ts](proxy.ts) (project root) implements sliding-window rate limiting applied to all `/api/*` routes: 20 requests per minute per IP. IPs are tracked in memory (capped at 10,000 entries). Exceeding the limit returns HTTP 429 with `Retry-After` and `X-RateLimit-*` headers. The middleware fails open when the IP map is at capacity to avoid blocking legitimate traffic.

### Key Files

- [lib/workflowExecutor/](lib/workflowExecutor/) — modular executor directory:
  - `index.ts` — `WorkflowExecutor` class; orchestrates the flow; defines `WorkflowEvent` / `WorkflowEventHandler`
  - `aiAgent.ts` — AIAgent execution loop, system prompt building, tool binding
  - `chatTrigger.ts` — ChatTrigger node handler
  - `mcpClient.ts` — MCP tool binding and execution
  - `mcpInitializer.ts` — initializes MCP connections, triggers OAuth2 if needed
  - `utils.ts` — tool name normalization, JSON parsing, agent decision parsing
  - `types.ts` — `ConnectedMCPClient`, `AgentToolBinding`, `AgentDecision` interfaces
- [lib/workflowValidation.ts](lib/workflowValidation.ts) — workflow validation logic
- [lib/agentAuth.ts](lib/agentAuth.ts) — Asgardeo OAuth2 + PKCE flow; called by `mcpInitializer.ts`
- [lib/oboAuth.ts](lib/oboAuth.ts) — OBO PKCE helpers: `buildOBOAuthorizationUrl()`, `exchangeOBOCode()`
- [lib/authTrace.ts](lib/authTrace.ts) — auth/tool trace types and helpers
- [lib/llmProviders.ts](lib/llmProviders.ts) — `LLMProvider` interface; factory for OpenAI, Gemini, and Anthropic providers
- [lib/mcpClientNode.ts](lib/mcpClientNode.ts) — MCP HTTP connection, tool discovery, tool execution, reconnection with exponential backoff (1 s → 10 s, factor 1.5, max 2 retries)
- [lib/types.ts](lib/types.ts) — `Workflow`, `WorkflowNode`, `NodeData` union types, `ExecutionContext`
- [lib/workflowStore.ts](lib/workflowStore.ts) — localStorage wrapper for workflows, memory, API keys, OBO tokens (`getOBOToken`, `setOBOToken`, `clearOBOTokens`), and MCP tools cache (`getMCPTools`, `setMCPTools`, `clearMCPTools`)
- [lib/useWorkflow.ts](lib/useWorkflow.ts) — React hook for CRUD on workflows and node/edge manipulation
- [lib/useChat.ts](lib/useChat.ts) — React hook for chat message management, SSE parsing, OBO consent, `activeNodeIds`
- [lib/utils.ts](lib/utils.ts) — `cn()` Tailwind class-merging helper
- [components/WorkflowEditor.tsx](components/WorkflowEditor.tsx) — React Flow canvas, node/edge event handlers
- [components/NodePanel.tsx](components/NodePanel.tsx) — configuration UI for the selected node
- [components/ChatPanel.tsx](components/ChatPanel.tsx) — chat UI (right panel)
- [components/AuthFlowDiagram.tsx](components/AuthFlowDiagram.tsx) — renders `WorkflowTrace` as a sequence diagram (post-run, inline in chat)
- [components/AuthFlowOverview.tsx](components/AuthFlowOverview.tsx) — interactive sequence diagram for the `/auth-flow` page; supports Agent, OBO, and None flow types with Play/Step/Show All controls
- [components/nodes/ActiveBorder.tsx](components/nodes/ActiveBorder.tsx) — glowing-border overlay used by every node when active
- [components/nodes/ErrorBorder.tsx](components/nodes/ErrorBorder.tsx) — red error-state border overlay for workflow nodes
- [components/nodes/PlusHandle.tsx](components/nodes/PlusHandle.tsx) — handle component for drawing new edges from a node
- [app/page.tsx](app/page.tsx) — home page (workflow builder)
- [app/auth-flow/page.tsx](app/auth-flow/page.tsx) — static page rendering `AuthFlowOverview`
- [app/api/execute-workflow/route.ts](app/api/execute-workflow/route.ts) — POST endpoint streaming SSE events from WorkflowExecutor (60 s timeout)
- [app/api/execute-llm/route.ts](app/api/execute-llm/route.ts) — POST endpoint for single LLM calls; input: `{ provider, model, message, systemPrompt, temperature, maxTokens, apiKey }`
- [app/api/initialize-mcp/route.ts](app/api/initialize-mcp/route.ts) — POST endpoint to initialize an MCP connection with optional OAuth2 config
- [app/api/obo/init/route.ts](app/api/obo/init/route.ts) — POST: generates OBO auth URL, state, and code verifier
- [app/api/obo/exchange/route.ts](app/api/obo/exchange/route.ts) — POST: exchanges OBO auth code + code verifier for a user-scoped access token
- [proxy.ts](proxy.ts) — sliding-window rate-limiting middleware for all `/api/*` routes

`components/ui/` contains only 6 minimal primitives (button, dialog, dropdown-menu, input, spinner, textarea) — the broader shadcn/ui component set has been removed. There is no `hooks/` directory; `useWorkflow.ts` and `useChat.ts` live in `lib/`.

### Agent Authentication (`lib/agentAuth.ts`)

Implements server-side Asgardeo OAuth2 with PKCE (no client secret). `authenticateAgent(config)` runs three steps against `https://api.asgardeo.io/t/{organizationName}`:

1. `POST /oauth2/authorize` — gets `flowId` + `authenticatorId`
2. `POST /oauth2/authn` — submits `agentId` (username) + `agentSecret` (password), gets auth code
3. `POST /oauth2/token` — exchanges code + `code_verifier` for access token

OAuth2 credentials (`ORGANIZATION_NAME`, `CLIENT_ID`, `REDIRECT_URI`, `SCOPE`) are configured in `.env` for local development. In the workflow UI, they are stored per MCPClient node under `oauth2*` fields.

### Tool Name Normalization

`lib/workflowExecutor/utils.ts` normalizes MCP tool names before exposing them to the agent: lowercase, strip non-alphanumeric (except `_`), collapse underscores, prepend `tool_` if starts with a digit, truncate to 64 chars. Collisions across multiple MCP clients are resolved by appending `_2`, `_3`, etc. The original name is kept internally for actual MCP calls.

### localStorage Keys

| Key | Contents |
|-----|---------|
| `workflows` | Array of `Workflow` objects |
| `currentWorkflow` | Active workflow ID |
| `workflowMemories` | `{ workflowId → { memoryNodeId → Message[] } }` |
| `apiKeys` | OpenAI, Gemini, and Anthropic API keys |
| `oboTokens` | `{ nodeId → accessToken }` — per-MCPClient OBO access tokens |
| `mcpTools` | `{ nodeId → ToolDefinition[] }` — cached MCP tool discovery results |

### Path Alias

`@/*` maps to the project root (configured in [tsconfig.json](tsconfig.json)).
