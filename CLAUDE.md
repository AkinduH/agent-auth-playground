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
| `ChatTrigger` | Entry point — receives user's chat message |
| `LLM` | Direct call to OpenAI or Gemini |
| `AIAgent` | Agentic loop with tool-calling; consumes tools from connected MCP nodes. Has `agentId`/`agentSecret` fields for OAuth2 |
| `MCPClient` | Connects to an MCP server, discovers tools; optionally authenticates via OAuth2 (`useOAuth2` flag) |
| `Memory` | Reads/writes conversation history to `localStorage` |

### Execution Flow

1. User sends a message in **ChatPanel** → `useChat.ts` calls `POST /api/execute-workflow`
2. The API route validates the workflow (must have a ChatTrigger; all nodes connected; AIAgent must connect to LLM; MCPClient needs an endpoint; Memory must have an incoming edge from AIAgent), then instantiates **`WorkflowExecutor`** ([lib/workflowExecutor.ts](lib/workflowExecutor.ts))
3. Executor finds the `ChatTrigger` node, then recursively walks connected edges via `executeNode()`
4. For AIAgent nodes, it loops up to `maxToolSteps` (1–12, default 6): sends a prompt with available tools to the LLM, parses a JSON decision `{"type":"final"|"tool","name":"...","arguments":{}}`, and calls the tool via MCP if needed
5. If `MCPClientNode.useOAuth2` is enabled, `authenticateAgent()` from `lib/agentAuth.ts` runs a 3-step PKCE flow against Asgardeo before connecting
6. Results stream back; if a Memory node exists, messages are stored in `localStorage['workflowMemories']`

### Key Files

- [lib/workflowExecutor.ts](lib/workflowExecutor.ts) — all node-execution logic, AI agent loops, MCP tool resolution
- [lib/agentAuth.ts](lib/agentAuth.ts) — Asgardeo OAuth2 + PKCE flow for agent authentication; called by WorkflowExecutor when MCPClient has `useOAuth2: true`
- [lib/llmProviders.ts](lib/llmProviders.ts) — `LLMProvider` interface; factory for OpenAI and Gemini providers
- [lib/mcpClientNode.ts](lib/mcpClientNode.ts) — MCP HTTP connection, tool discovery, tool execution, reconnection with exponential backoff
- [lib/types.ts](lib/types.ts) — `Workflow`, `WorkflowNode`, `NodeData` union types, `ExecutionContext`
- [lib/workflowStore.ts](lib/workflowStore.ts) — localStorage wrapper for workflows, memory, and API keys
- [lib/useWorkflow.ts](lib/useWorkflow.ts) — React hook for CRUD on workflows and node/edge manipulation
- [lib/useChat.ts](lib/useChat.ts) — React hook for chat message management and workflow execution
- [components/WorkflowEditor.tsx](components/WorkflowEditor.tsx) — React Flow canvas, node/edge event handlers
- [components/NodePanel.tsx](components/NodePanel.tsx) — configuration UI for the selected node
- [app/api/execute-workflow/route.ts](app/api/execute-workflow/route.ts) — POST endpoint wrapping WorkflowExecutor (60s timeout)
- [app/api/execute-llm/route.ts](app/api/execute-llm/route.ts) — POST endpoint for single LLM calls; input: `{ provider, model, message, systemPrompt, temperature, maxTokens, apiKey }`

### Agent Authentication (`lib/agentAuth.ts`)

Implements server-side Asgardeo OAuth2 with PKCE (no client secret). `authenticateAgent(config)` runs three steps against `https://api.asgardeo.io/t/{organizationName}`:
1. `POST /oauth2/authorize` — gets `flowId` + `authenticatorId`
2. `POST /oauth2/authn` — submits `agentId` (username) + `agentSecret` (password), gets auth code
3. `POST /oauth2/token` — exchanges code + code_verifier for access token

The `agent-auth-sample/` directory contains a standalone Express server (`server.ts`) exposing `POST /auth/token` and a simplified version of the auth flow (`agentAuth.ts`) driven by `.env` variables — useful for isolated testing of the auth module.

### localStorage Keys

| Key | Contents |
|-----|---------|
| `workflows` | Array of `Workflow` objects |
| `currentWorkflow` | Active workflow ID |
| `workflowMemories` | `{ workflowId → { memoryNodeId → Message[] } }` |
| `apiKeys` | OpenAI and Gemini API keys |

### Path Alias

`@/*` maps to the project root (configured in [tsconfig.json](tsconfig.json)).
