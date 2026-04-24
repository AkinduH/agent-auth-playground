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

### Key Files

- [lib/workflowExecutor/](lib/workflowExecutor/) — modular executor directory:
  - `index.ts` — `WorkflowExecutor` class; orchestrates the flow
  - `aiAgent.ts` — AIAgent execution loop, system prompt building, tool binding
  - `chatTrigger.ts` — ChatTrigger node handler
  - `mcpClient.ts` — MCP tool binding and execution
  - `mcpInitializer.ts` — initializes MCP connections, triggers OAuth2 if needed
  - `utils.ts` — tool name normalization, JSON parsing, agent decision parsing
  - `types.ts` — `ConnectedMCPClient`, `AgentToolBinding`, `AgentDecision` interfaces
- [lib/workflowValidation.ts](lib/workflowValidation.ts) — workflow validation logic
- [lib/agentAuth.ts](lib/agentAuth.ts) — Asgardeo OAuth2 + PKCE flow; called by `mcpInitializer.ts`
- [lib/llmProviders.ts](lib/llmProviders.ts) — `LLMProvider` interface; factory for OpenAI, Gemini, and Anthropic providers
- [lib/mcpClientNode.ts](lib/mcpClientNode.ts) — MCP HTTP connection, tool discovery, tool execution, reconnection with exponential backoff (1 s → 10 s, factor 1.5, max 2 retries)
- [lib/types.ts](lib/types.ts) — `Workflow`, `WorkflowNode`, `NodeData` union types, `ExecutionContext`
- [lib/workflowStore.ts](lib/workflowStore.ts) — localStorage wrapper for workflows, memory, and API keys
- [lib/useWorkflow.ts](lib/useWorkflow.ts) — React hook for CRUD on workflows and node/edge manipulation
- [lib/useChat.ts](lib/useChat.ts) — React hook for chat message management and workflow execution
- [components/WorkflowEditor.tsx](components/WorkflowEditor.tsx) — React Flow canvas, node/edge event handlers
- [components/NodePanel.tsx](components/NodePanel.tsx) — configuration UI for the selected node
- [components/ChatPanel.tsx](components/ChatPanel.tsx) — chat UI (right panel)
- [app/api/execute-workflow/route.ts](app/api/execute-workflow/route.ts) — POST endpoint wrapping WorkflowExecutor (60 s timeout)
- [app/api/execute-llm/route.ts](app/api/execute-llm/route.ts) — POST endpoint for single LLM calls; input: `{ provider, model, message, systemPrompt, temperature, maxTokens, apiKey }`

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

### Path Alias

`@/*` maps to the project root (configured in [tsconfig.json](tsconfig.json)).
