# Auth Playground Documentation

Auth Playground is a browser-based visual AI workflow builder. You design workflows by connecting nodes on a canvas, then test them through an integrated chat panel. Every workflow is stored in your browser's `localStorage` — no server, no database.

---

## Documentation Index

### Getting Started
- [Getting Started](getting-started.md) — Installation, first workflow, and key concepts

### Nodes
- [Chat Trigger](nodes/chat-trigger.md) — Workflow entry point that receives user messages
- [AI Agent](nodes/ai-agent.md) — Autonomous agent with MCP tool-calling loop
- [LLM (AI Service)](nodes/llm.md) — Direct LLM call to OpenAI, Gemini, or Anthropic
- [MCP Client](nodes/mcp-client.md) — Connects to MCP servers and exposes tools to the agent

### Core Concepts
- [Workflow Editor](workflow-editor.md) — Canvas, toolbar, connections, and keyboard shortcuts
- [Execution Flow](execution-flow.md) — How a user message travels through the workflow
- [Streaming Protocol](streaming-protocol.md) — Server-sent events and the active-node glow effect

### Authentication
- [Auth Flows](auth-flows.md) — Agent OAuth2 (PKCE) and On-Behalf-Of (OBO) user consent flows
- [Auth Flow Diagram](auth-flow-diagram.md) — The sequence diagram inspector and trace system

### Reference
- [API Reference](api-reference.md) — `/api/execute-workflow`, `/api/execute-llm`, `/api/obo/*` endpoints
- [Persistence](persistence.md) — What is stored in localStorage and how to manage it
- [Workflow Validation](validation.md) — Rules enforced before every execution

---

## Quick Architecture Overview

```
┌─────────────┐      ┌──────────────┐      ┌───────────┐
│ ChatTrigger │ ───▶ │   AI Agent   │ ───▶ │ MCP Client│
└─────────────┘      └──────┬───────┘      └───────────┘
                            │ top handle
                     ┌──────▼───────┐
                     │  LLM (AI     │
                     │  Service)    │
                     └──────────────┘
```

| Node | Purpose |
|------|---------|
| **Chat Trigger** | Receives the user's message and starts the workflow |
| **AI Agent** | Runs a tool-calling decision loop using the LLM |
| **LLM** | Makes direct calls to an external AI provider |
| **MCP Client** | Connects to an MCP server to discover and call tools |

All workflow state (nodes, edges, chat history, API keys, auth tokens) is stored in browser `localStorage`. There is no back-end database.
