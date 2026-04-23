# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Next.js development server
npm run build    # Production build
npm run lint     # ESLint
```

No test framework is configured. TypeScript build errors are suppressed via `ignoreBuildErrors: true` in [next.config.mjs](next.config.mjs).

## Architecture

**Auth Playground** is a visual, browser-based AI workflow builder. Users design workflows by connecting nodes on a React Flow canvas, then test them via a chat panel on the right. All workflow state persists in browser `localStorage`; there is no database.

### Node Types

| Node | Role |
|------|------|
| `ChatTrigger` | Entry point — receives user's chat message |
| `LLM` | Direct call to OpenAI or Gemini |
| `AIAgent` | Agentic loop with tool-calling; consumes tools from connected MCP nodes |
| `MCPClient` | Connects to an MCP server, discovers tools |
| `Memory` | Reads/writes conversation history to `localStorage` |

### Execution Flow

1. User sends a message in **ChatPanel** → `useChat.ts` calls `POST /api/execute-workflow`
2. The API route instantiates **`WorkflowExecutor`** ([lib/workflowExecutor.ts](lib/workflowExecutor.ts), the core engine at ~620 lines)
3. Executor finds the `ChatTrigger` node, then recursively walks connected edges via `executeNode()`
4. Results stream back; if a Memory node exists, messages are stored in `localStorage['workflowMemories']`

### Key Files

- [lib/workflowExecutor.ts](lib/workflowExecutor.ts) — all node-execution logic, AI agent loops, MCP tool resolution
- [lib/llmProviders.ts](lib/llmProviders.ts) — `LLMProvider` interface; factory for OpenAI and Gemini providers
- [lib/mcpClientNode.ts](lib/mcpClientNode.ts) — MCP HTTP connection, tool discovery, tool execution
- [lib/types.ts](lib/types.ts) — `Workflow`, `WorkflowNode`, `NodeData` union types, `ExecutionContext`
- [lib/workflowStore.ts](lib/workflowStore.ts) — localStorage wrapper for workflows, memory, and API keys
- [lib/useWorkflow.ts](lib/useWorkflow.ts) — React hook for CRUD on workflows and node/edge manipulation
- [lib/useChat.ts](lib/useChat.ts) — React hook for chat message management and workflow execution
- [components/WorkflowEditor.tsx](components/WorkflowEditor.tsx) — React Flow canvas, node/edge event handlers
- [components/NodePanel.tsx](components/NodePanel.tsx) — configuration UI for the selected node
- [app/api/execute-workflow/route.ts](app/api/execute-workflow/route.ts) — POST endpoint wrapping WorkflowExecutor

### localStorage Keys

| Key | Contents |
|-----|---------|
| `workflows` | Array of `Workflow` objects |
| `currentWorkflow` | Active workflow ID |
| `workflowMemories` | `{ workflowId → { memoryNodeId → Message[] } }` |
| `apiKeys` | OpenAI and Gemini API keys |

### Path Alias

`@/*` maps to the project root (configured in [tsconfig.json](tsconfig.json)).
