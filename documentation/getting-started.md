# Getting Started

Auth Playground runs entirely in your browser — no installation required. Open the app and you're ready to build.

---

## Before You Begin

You'll need an API key from at least one AI provider. The key is stored only in your browser and is sent only to that provider's API when you run a workflow.

| Provider | Where to get a key |
|----------|--------------------|
| Google Gemini | [aistudio.google.com](https://aistudio.google.com) |
| OpenAI | [platform.openai.com](https://platform.openai.com) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com) |

---

## Build Your First Workflow

This walkthrough creates a simple AI chatbot. The whole thing takes about two minutes.

### 1 — Add a Chat Trigger

Click **+ Chat Trigger** in the toolbar at the top of the canvas. This node is the entry point of every workflow — it receives messages from the chat panel.

Every workflow must have exactly one Chat Trigger.

### 2 — Add an AI Agent

Click **+ AI Agent**. The AI Agent is the reasoning engine of your workflow. It receives your message and decides what to do with it — either answer directly or call a tool.

### 3 — Add an AI Service

Click **+ AI Service**. Click the node to select it, then configure it in the right panel:

1. Choose a **Provider** — Gemini, OpenAI, or Anthropic
2. Choose a **Model** from the dropdown
3. Enter your **API Key** — it is saved to your browser automatically

### 4 — Connect the Nodes

Hover over the Chat Trigger until small circles (handles) appear on its edges. Drag from the **right handle** of the Chat Trigger to the **left handle** of the AI Agent.

Then drag from the **top handle** of the AI Agent to the **bottom handle** of the AI Service.

Your workflow should look like this:

```
[Chat Trigger] ──▶ [AI Agent] ──▶ [AI Service]
```

> The canvas only accepts valid connections. If a drag is rejected, check that you're starting from the correct handle on each node.

### 5 — Send a Message

Click on any empty area of the canvas to open the chat panel on the right. Type a message and press **Enter**.

The nodes will glow as they execute. Your response will appear in the chat once the workflow completes.

### 6 — Inspect the Auth Flow

After the workflow finishes, click **View Auth Flow** in the chat panel header. This opens an interactive sequence diagram showing exactly what happened during execution — which nodes ran, what the agent decided at each step, and (for OAuth2 workflows) every authentication exchange.

Use this to understand how your workflow behaved, debug unexpected results, or explore what tokens were used.

---

## Workflow Patterns

### Simple chatbot

```
Chat Trigger → AI Agent → AI Service
```

The agent answers questions directly using the LLM. No external tools.

### Agent with tools (MCP)

```
Chat Trigger → AI Agent → AI Service
                  └──→ MCP Client
```

Add one or more **MCP Client** nodes connected to the AI Agent's right handle. The agent can then call tools from external MCP servers. The LLM decides which tool to call at each step.

See [MCP Client](nodes/mcp-client.md) to learn how to connect to an MCP server.

### Agent with OAuth2-protected tools

```
Chat Trigger → AI Agent (Agent ID + Secret) → AI Service
                  └──→ MCP Client (OAuth2: Agent Flow)
```

Before connecting to the MCP server, the agent authenticates with Asgardeo using its own credentials and gets an access token. No user interaction is required.


### Agent acting on behalf of the user (OBO)

```
Chat Trigger → AI Agent (Agent ID + Secret) → AI Service
                  └──→ MCP Client (OAuth2: OBO Flow)
```

When you send your first message, the chat panel shows an **Authorize** button. You log in to Asgardeo and grant consent. The agent then calls the MCP server using a token that carries your identity.

---

## Key Concepts

### Everything stays in your browser

Workflows, chat history, API keys, and auth tokens are all stored in your browser's local storage. Nothing is saved on any server. Clearing your browser data resets everything.

### Node connections are enforced

Each node type has fixed handles that only connect to specific other nodes. The canvas prevents invalid connections, so you can't accidentally wire things incorrectly.

| From | Handle | To |
|------|--------|-----|
| Chat Trigger | Right | AI Agent |
| AI Agent | Top | AI Service |
| AI Agent | Right | MCP Client |
