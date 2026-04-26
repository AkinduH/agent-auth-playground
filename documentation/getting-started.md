# Getting Started

## Prerequisites

- Node.js 18+
- [pnpm](https://pnpm.io/) package manager
- An API key for at least one LLM provider (OpenAI, Google Gemini, or Anthropic)

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd auth-playground

# Install dependencies (always use pnpm)
pnpm install

# Start the development server
pnpm dev
```

The app opens at `http://localhost:3000`.

## Building for Production

```bash
pnpm build
```

> TypeScript build errors are suppressed via `ignoreBuildErrors: true` in `next.config.mjs`.

---

## Your First Workflow

This example creates a simple chatbot that answers questions directly using an LLM.

### Step 1 — Add a Chat Trigger

Click **+ Chat Trigger** in the toolbar. This node is always the entry point of a workflow. Every workflow must have exactly one.

### Step 2 — Add an LLM Node

Click **+ AI Service**. Select the node and configure it in the right panel:

1. Choose a **Provider** (Gemini, OpenAI, or Anthropic).
2. Choose a **Model** from the dropdown.
3. Paste your **API Key** in the password field. It is stored only in your browser.
4. Optionally edit the **System Prompt**.

### Step 3 — Connect the Nodes

Drag from the Chat Trigger's right handle to the LLM node's bottom handle. You should see an animated edge appear.

> **Note:** Direct Chat Trigger → LLM connections are not yet supported by the executor. The intended minimal pattern is **Chat Trigger → AI Agent → LLM**. See [Workflow Patterns](#workflow-patterns) below.

### Step 4 — Add an AI Agent

For a working workflow, the recommended minimum is:

```
Chat Trigger → AI Agent → LLM (AI Service)
```

1. Click **+ AI Agent** and add it to the canvas.
2. Connect Chat Trigger's right handle → AI Agent's left handle.
3. Connect AI Agent's **top** handle → LLM's **bottom** handle.
4. Configure the AI Agent in the right panel (system prompt, temperature, etc.).

### Step 5 — Send a Message

Click the chat input on the right side panel, type a message, and press **Enter**. Watch the nodes glow as they execute.

---

## Workflow Patterns

### Pattern 1: Simple Agent with Direct LLM

```
ChatTrigger → AIAgent → LLM
```

The agent receives your message and uses the LLM to generate a response. No tools are available.

### Pattern 2: Agent with MCP Tools

```
ChatTrigger → AIAgent → LLM
                  └──────→ MCP Client (1..N)
```

The agent can call tools from one or more MCP servers. The LLM decides which tool to call each step.

### Pattern 3: Agent with OAuth2-Protected MCP Server

```
ChatTrigger → AIAgent (agentId + agentSecret) → LLM
                  └──────────────────────────────→ MCP Client (useOAuth2=true, Agent Flow)
```

Before connecting, the agent authenticates to Asgardeo using its credentials and obtains an access token.

### Pattern 4: Agent Acting On Behalf of User (OBO)

```
ChatTrigger → AIAgent (agentId + agentSecret) → LLM
                  └──────────────────────────────→ MCP Client (useOAuth2=true, OBO Flow)
```

Before the first message is processed, the user is prompted to log in and grant consent. The agent then calls the MCP server using a token that carries the user's identity.

---

## Key Concepts

### Everything Lives in the Browser

No server stores your data. Workflows, chat messages, API keys, and auth tokens all live in `localStorage`. Clearing browser storage resets everything.

### Node Handles Enforce Connection Rules

Each node type has specific handles that only accept certain connections:

| Source Node | Handle | Allowed Target |
|-------------|--------|----------------|
| AI Agent | top | LLM only |
| AI Agent | right | MCP Client only |
| Chat Trigger | right | AI Agent |
| LLM | bottom | AI Agent (top) |
| MCP Client | left | AI Agent (right) |

### The Agent Loop

When an AI Agent executes, it runs a loop (up to `maxToolSteps`, default 6):

1. Ask the LLM: "Given the user's request and available tools, what should I do?"
2. If the LLM says **call a tool** → execute it, log the result, continue the loop.
3. If the LLM says **final answer** → return the answer to the user.
4. If the loop exhausts all steps → call the LLM one more time to synthesize a final answer.

### Streaming Execution

Workflow execution streams in real-time over Server-Sent Events (SSE). Each node emits `node-start` and `node-end` events, which trigger the glowing border animation on the canvas.

---

## Environment Variables

For local development with Asgardeo OAuth2, create a `.env` file in the project root:

```env
ORGANIZATION_NAME=your-asgardeo-tenant
CLIENT_ID=your-oauth2-client-id
REDIRECT_URI=http://localhost:3000/callback
SCOPE=openid
```

These are fallback values. In production, OAuth2 credentials are configured per MCP Client node in the workflow UI.
