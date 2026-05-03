# Agent-Auth-Playground

A visual, browser-based AI workflow builder for designing and testing authentication-aware agentic pipelines. Connect LLM nodes, AI agents, and MCP (Model Context Protocol) tool servers on a drag-and-drop canvas, then test them interactively in a built-in chat panel.

![Canvas](public/canvas.png)

---

## Features

- **Visual Workflow Editor** — drag-and-drop canvas powered by React Flow; connect nodes with typed handles that enforce valid topologies
- **Four Node Types** — ChatTrigger, LLM (OpenAI / Gemini / Anthropic), AIAgent (agentic loop with tool-calling), MCPClient (MCP server bridge)
- **Agentic Loop** — the AIAgent node iteratively calls an LLM and dispatches MCP tools up to a configurable step limit, then synthesizes a final answer
- **OAuth2 / PKCE Authentication** — Agent credentials (from Asgardeo) and OBO (On-Behalf-Of) token exchange in action
- **Auth Flow Inspector** — every run produces a structured trace; a sequence-diagram view shows every auth step and tool call
- **Streaming Execution** — The canvas lights up node-by-node as the workflow runs
- **localStorage Persistence** — workflows, memory, API keys, and MCP tool caches all survive page refreshes with no server-side state

---

## Tech Stack

| Layer | Libraries |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript 5.7 |
| Canvas | React Flow 11 |
| Styling | Tailwind CSS 4, Radix UI primitives |
| LLM | LangChain (Anthropic, OpenAI, Google GenAI) |
| MCP | `@modelcontextprotocol/sdk` |
| Auth | Asgardeo JS SDK, custom PKCE helpers |
| Forms | React Hook Form + Zod |
| UI Extras | Sonner toasts, React Resizable Panels, React Markdown + GFM |
| Package manager | **pnpm** (do not use npm) |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- pnpm (`npm install -g pnpm`)
- An [Asgardeo](https://wso2.com/asgardeo/) organisation (for OAuth2 flows — optional for basic LLM usage)

### Installation

```bash
git clone <repo-url>
cd agent-auth-playground
pnpm install
```

### Environment Variables

Copy the template below to `.env` in the project root and fill in your values:

```env
# Asgardeo organisation name (the subdomain at api.asgardeo.io/t/<name>)
ORGANIZATION_NAME=your-org

# OAuth2 application client ID registered in Asgardeo
CLIENT_ID=your-client-id

# Agent identity credentials (username / password in Asgardeo)
AGENT_ID=your-agent-id
AGENT_SECRET=your-agent-secret

# Redirect URI registered in the Asgardeo application
REDIRECT_URI=http://localhost:4829

# OAuth2 scopes to request (space-separated)
SCOPE=openid sub

# Port for the custom rate-limiting proxy (optional, defaults to 4829)
PORT=4829
```

> **LLM API keys** (OpenAI, Gemini, Anthropic) are entered directly in the chat panel at runtime and stored in `localStorage` — they are never sent to the server unrelated to a workflow execution.

### Running Locally

```bash
pnpm dev      # Start the Next.js dev server
pnpm build    # Production build
pnpm start    # Serve the production build
pnpm lint     # ESLint
```

The app runs on **port 4829** by default (configured in `proxy.ts`).

---

## Architecture

### Node Types

| Node | Role | Key Fields |
|------|------|-----------|
| **ChatTrigger** | Entry point; receives the user's chat message | — |
| **LLM** | Single call to an LLM provider | `provider`, `model`, `systemPrompt`, `temperature`, `maxTokens` |
| **AIAgent** | Agentic loop with MCP tool-calling | `systemPrompt`, `temperature`, `maxTokens`, `maxToolSteps` (1–12), `maxMessages` (memory window), `agentId`, `agentSecret` |
| **MCPClient** | Connects to an MCP server and discovers tools | `mcpServerEndpoint`, `useOAuth2`, `oauth2OrganizationName`, `oauth2ClientId`, `oauth2RedirectUri`, `oauth2Scope` |

### Connection Rules

React Flow enforces typed handles to prevent invalid topologies:

- **ChatTrigger** → can connect to any downstream node (source on the right)
- **AIAgent `top` handle** → connects only to `LLM` nodes
- **AIAgent `right` handle** → connects only to `MCPClient` nodes
- **LLM** has a single `target` handle (bottom)
- **MCPClient** has a single `target` handle (left)

### Execution Flow

```
User message
    │
    ▼
POST /api/execute-workflow
    │
    ├─ workflowValidation.ts  ← validates topology
    │
    ▼
WorkflowExecutor.execute()
    │
    ├─ ChatTrigger  →  AIAgent  ──(top)──▶  LLM
    │                   │
    │                   └──(right)─▶  MCPClient(s)
    │
    ▼  (SSE stream of WorkflowEvents)
useChat.ts  →  ChatPanel + canvas node glow
```

1. The API validates the workflow (ChatTrigger must exist; all non-trigger nodes need incoming edges; AIAgent must connect to an LLM; MCPClient requires `mcpServerEndpoint`).
2. `WorkflowExecutor` finds the `ChatTrigger` and walks connected edges via `executeNode()`.
3. For **AIAgent** nodes the loop runs up to `maxToolSteps` iterations:
   - Calls the LLM with the current tool list and execution history.
   - Parses a JSON decision `{"type":"final"|"tool","name":"...","arguments":{}}`.
   - `"tool"` → executes the named MCP tool and appends the result; `"final"` → exits the loop.
   - If all steps are exhausted, calls the LLM one final time without tool schemas to synthesize an answer.
4. Memory context: the last `maxMessages` saved messages from `workflowMemories` are prepended as agent context.

### Streaming Protocol (SSE)

`POST /api/execute-workflow` returns `Content-Type: text/event-stream`. Each `data:` frame is a JSON `WorkflowEvent`:

| Event | Fields | Purpose |
|-------|--------|---------|
| `node-start` | `nodeId` | Node begins executing |
| `node-end` | `nodeId` | Node finishes |
| `result` | `success`, `output`, `error`, `executionTime`, `trace` | Terminal frame |

The client enforces a 1-second minimum glow window per node so fast executions are still visible.

### Authentication Flows

#### Agent OAuth2 (client-credentials + PKCE)

When `MCPClientNode.useOAuth2` is enabled, `lib/agentAuth.ts` runs a three-step server-side PKCE flow against Asgardeo before connecting to the MCP server:

1. `POST /oauth2/authorize` → `flowId` + `authenticatorId`
2. `POST /oauth2/authn` → submits `agentId` / `agentSecret`, receives auth code
3. `POST /oauth2/token` → exchanges code + `code_verifier` for access token

#### OBO (On-Behalf-Of) Tokens

The executor accepts an `oboTokens` map (`MCPClient nodeId → access token`). When present, MCP calls forward the **user's** OBO token instead of the agent's token. The UI manages a consent handshake (`oboConsentPending`): the user approves, then the token is patched into the next request.

`lib/oboAuth.ts` provides:
- `buildOBOAuthorizationUrl()` — embeds the agent's access token as the actor
- `exchangeOBOCode()` — exchanges the auth code + code verifier for a user-scoped token

API routes: `POST /api/obo/init` (generate auth URL) and `POST /api/obo/exchange` (token exchange).

### Auth Flow Inspector

Every execution populates a `WorkflowTrace` (defined in `lib/authTrace.ts`) returned in the terminal SSE frame. `components/AuthFlowDiagram.tsx` renders it as an inline sequence diagram. The `/auth-flow` page renders `AuthFlowOverview` — an interactive version with Play / Step / Show-All controls that visualises Agent, OBO, or passthrough flows.

### Rate Limiting

`proxy.ts` (project root) wraps the Next.js server with sliding-window rate limiting:

- **Limit:** 20 requests per minute per IP
- **Headers returned on 429:** `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Fail-open:** when the in-memory IP map reaches 10,000 entries, requests are passed through to avoid blocking legitimate traffic.

### localStorage Schema

| Key | Contents |
|-----|---------|
| `workflows` | `Workflow[]` — all saved workflows |
| `currentWorkflow` | Active workflow ID |
| `workflowMemories` | `{ workflowId → { memoryNodeId → Message[] } }` |
| `apiKeys` | OpenAI, Gemini, and Anthropic API keys |
| `oboTokens` | `{ nodeId → accessToken }` |
| `mcpTools` | `{ nodeId → ToolDefinition[] }` — cached MCP tool discovery results |

---

## Project Structure

```
auth-playground/
├── app/
│   ├── page.tsx                    # Home — workflow builder
│   ├── auth-flow/page.tsx          # Auth flow visualiser
│   ├── layout.tsx
│   └── api/
│       ├── execute-workflow/       # POST — SSE execution stream
│       ├── execute-llm/            # POST — single LLM call
│       ├── initialize-mcp/         # POST — MCP initialisation
│       └── obo/
│           ├── init/               # POST — generate OBO auth URL
│           └── exchange/           # POST — exchange OBO auth code
├── components/
│   ├── WorkflowEditor.tsx          # React Flow canvas
│   ├── NodePanel.tsx               # Node configuration panel
│   ├── ChatPanel.tsx               # Chat UI
│   ├── AuthFlowDiagram.tsx         # Inline trace sequence diagram
│   ├── AuthFlowOverview.tsx        # Interactive /auth-flow page diagram
│   ├── nodes/
│   │   ├── ChatTriggerNode.tsx
│   │   ├── AIAgentNode.tsx
│   │   ├── LLMNode.tsx
│   │   ├── MCPClientNode.tsx
│   │   ├── ActiveBorder.tsx        # Glowing border while node is active
│   │   ├── ErrorBorder.tsx         # Red border on node error
│   │   └── PlusHandle.tsx          # Edge-creation handle
│   └── ui/                         # Minimal Radix UI primitives
├── lib/
│   ├── types.ts                    # Core type definitions
│   ├── useWorkflow.ts              # Workflow CRUD React hook
│   ├── useChat.ts                  # Chat + SSE + OBO consent hook
│   ├── workflowStore.ts            # localStorage helpers
│   ├── workflowValidation.ts       # Topology validation
│   ├── llmProviders.ts             # LLM provider factory
│   ├── agentAuth.ts                # Asgardeo OAuth2 + PKCE
│   ├── oboAuth.ts                  # OBO PKCE helpers
│   ├── authTrace.ts                # Trace types and helpers
│   ├── mcpClientNode.ts            # MCP HTTP client with retry
│   └── workflowExecutor/
│       ├── index.ts                # WorkflowExecutor class + event types
│       ├── aiAgent.ts              # AIAgent loop
│       ├── chatTrigger.ts
│       ├── mcpClient.ts            # MCP tool binding / execution
│       ├── mcpInitializer.ts       # MCP connection + OAuth2 trigger
│       ├── utils.ts                # Tool name normalisation, JSON helpers
│       └── types.ts                # Internal interfaces
├── proxy.ts                        # Rate-limiting middleware
├── next.config.mjs
├── tsconfig.json
└── package.json
```

---

## Tool Name Normalisation

MCP tool names are normalised before being exposed to the LLM agent: lowercased, non-alphanumeric characters (except `_`) stripped, consecutive underscores collapsed, `tool_` prepended if the name starts with a digit, truncated to 64 characters. Collisions across multiple MCP clients are resolved by appending `_2`, `_3`, etc. The original name is preserved internally for actual MCP calls.

---

## MCP Connection Retry

`lib/mcpClientNode.ts` reconnects with exponential backoff on failure:

- Initial delay: **1 s**
- Backoff factor: **1.5×**
- Maximum delay: **10 s**
- Maximum retries: **2**

---

## Known Limitations

- No test framework is configured.
- TypeScript build errors are suppressed via `ignoreBuildErrors: true` in `next.config.mjs`.
- All state is client-side; refreshing does not lose workflows, but clearing `localStorage` does.
- The `components/ui/` directory contains only 6 minimal primitives — the broader shadcn/ui set has been removed.
