# Auth Playground

Auth Playground is a visual, browser-based tool for building and testing AI agent workflows. Design workflows by connecting nodes on a canvas, then chat with them in the integrated chat panel on the right.

No account required. No data stored on any server. Everything lives in your browser.

---

## What You Can Build

| Workflow | What it does |
|----------|-------------|
| Simple chatbot | Ask questions and get answers from an LLM of your choice |
| Tool-calling agent | An AI agent that calls external services via MCP to complete tasks |
| Authenticated agent | An agent that signs in with its own credentials before accessing protected APIs |
| On-behalf-of agent | An agent that acts as a logged-in user, with that user's consent |

---

## Documentation

### Getting Started
- [Getting Started](getting-started.md) — Build your first workflow in a few minutes

### Nodes
- [Chat Trigger](nodes/chat-trigger.md) — The entry point of every workflow
- [AI Agent](nodes/ai-agent.md) — The reasoning engine that decides what to do
- [AI Service (LLM)](nodes/llm.md) — Connects to an AI model (Gemini, OpenAI, or Anthropic)
- [MCP Client](nodes/mcp-client.md) — Connects to an external tool server

### Using the App
- [Workflow Editor](workflow-editor.md) — Canvas controls, connections, and keyboard shortcuts

### Reference
- [Your Data](persistence.md) — What is stored in your browser and how to manage it

---
