# Execution Flow

This document traces the full lifecycle of a user message — from the moment it is typed in the chat panel to the moment the response appears.

---

## High-Level Overview

```
User types message
       │
       ▼
useChat.executeWorkflow()
       │
       ├── OBO tokens needed? ──▶ Show consent buttons ──▶ Exchange tokens ──┐
       │                                                                      │
       ▼                                                                      │
POST /api/execute-workflow  ◀───────────────────────────────────────────────┘
       │
       ▼
WorkflowExecutor.execute()
  └── executeNode(ChatTrigger)
       └── executeNode(AIAgent)
            ├── initializeMCPClients (OAuth2 if needed)
            └── executeAIAgent loop
                 ├── executeLLM → POST /api/execute-llm
                 ├── executeMCPClient (tool call)
                 ├── executeLLM again...
                 └── final answer
       │
       ▼
SSE stream: node-start/node-end events + final result
       │
       ▼
Chat panel shows response; canvas glow fades
```

---

## Step 1 — User Submits a Message

The user types in the chat panel and presses **Enter** or clicks **Send**.

`ChatPanel` calls `onSendMessage(text)` → `useChat.executeWorkflow(text, workflowDefinition)`.

---

## Step 2 — OBO Token Check (if applicable)

`useChat` scans the workflow for MCP Client nodes with `useOAuth2: true` and `oauth2Flow: 'obo'`.

For each OBO node, it checks `localStorage` for a valid (non-expired) token.

**If all tokens are present:** Skip to Step 3.

**If any token is missing:**

1. A user chat message is added.
2. For each missing node, `POST /api/obo/init` is called. The server authenticates the agent and returns an `authUrl`.
3. The chat panel displays an **Authorize** button linking to `authUrl`.
4. The user clicks the button — a popup window opens to the Asgardeo login page.
5. The user authenticates and grants consent.
6. Asgardeo redirects to the configured `redirectUri` with `?code=...&state=...`.
7. The redirect page posts `{ code, state }` on `BroadcastChannel('obo-callback')`.
8. `useChat` receives the code via the channel listener, calls `POST /api/obo/exchange`.
9. The OBO token is stored in `localStorage`.
10. If more nodes need tokens, the next **Authorize** prompt appears.
11. Once all tokens are collected, execution resumes from Step 3.

---

## Step 3 — Calling the Execute API

`useChat` calls:

```
POST /api/execute-workflow
Content-Type: application/json

{
  "workflow": { nodes, edges, id, name },
  "input": "user's message",
  "workflowId": "workflow-...",
  "apiKeys": { "gemini": "...", "openai": "...", "anthropic": "..." },
  "memoryMessages": [ ...last N messages from localStorage ],
  "oboTokens": { "nodeId": "access_token", ... }
}
```

---

## Step 4 — Workflow Validation

The API route runs `validateWorkflow(workflow)` before doing anything else. If validation fails, it returns an SSE `result` event with `success: false`.

See [Workflow Validation](validation.md) for the full list of rules.

---

## Step 5 — WorkflowExecutor

The executor is constructed with the workflow, input, API keys, memory messages, and OBO tokens. It finds the Chat Trigger node and begins recursive execution via `executeNode()`.

### ChatTrigger execution

1. Emits `node-start`.
2. Logs the input.
3. Emits `node-end`.
4. Finds the first outgoing edge and calls `executeNode(targetId)`.

### AIAgent execution

1. Finds the connected LLM node (required).
2. Finds all connected MCP Client nodes.
3. **Initializes MCP clients:**
   - For each MCP node, creates a connection.
   - If `useOAuth2: true, oauth2Flow: 'agent'`: runs the 3-step Asgardeo PKCE flow to get an access token.
   - If `useOAuth2: true, oauth2Flow: 'obo'`: retrieves the OBO token from the `oboTokens` map passed from the client.
   - Sets the token as the `Authorization: Bearer` header.
   - Discovers tools via `listTools()`.
4. Emits `node-start`.
5. Runs the **agent loop** (see below).
6. Emits `node-end`.
7. Disconnects all MCP clients.

### Agent Loop

```
for step = 1 to maxToolSteps:
  Build step prompt
  Call LLM → parse JSON response
  
  If { "type": "final" }:
    Return response  ◀── loop exits
  
  If { "type": "tool", "name": "...", "arguments": {...} }:
    Find the tool by normalized name
    Call executeMCPClient(tool, args)
    Append result to execution log
    Continue to next step

If loop exhausts steps:
  Call LLM with fallback prompt → return text
```

### LLM execution

Each LLM call from within the agent loop:

1. Builds the full message (step prompt or fallback prompt).
2. `POST /api/execute-llm` with provider, model, message, system prompt, temperature, maxTokens, API key.
3. Returns the text response.

### MCP tool execution

1. Looks up the tool binding by public (normalized) name.
2. Calls `client.callTool(originalName, arguments)`.
3. Formats the result (prefers text content over structured JSON).
4. Records the call in the auth trace.

---

## Step 6 — SSE Event Stream

The API route wraps the executor in a `ReadableStream` and sends Server-Sent Events:

```
data: {"type":"node-start","nodeId":"node-abc"}

data: {"type":"node-end","nodeId":"node-abc"}

data: {"type":"node-start","nodeId":"node-xyz"}

...

data: {"type":"result","success":true,"output":"The answer is...","executionTime":1234,"trace":{...}}
```

`useChat` reads this stream character-by-character, parses complete `data:` frames, and:

- `node-start` → adds node to `activeNodeIds` (triggers canvas glow).
- `node-end` → schedules removal from `activeNodeIds` after at least 1 second.
- `result` → adds assistant message to chat, updates the auth trace for the diagram.

---

## Step 7 — Response & Memory

After the `result` event:

1. The assistant message is added to the chat history.
2. If the AI Agent has `maxMessages` set: the user and assistant messages are appended to `localStorage` workflow memory.
3. The auth trace is stored in `lastTrace` for the Auth Flow Diagram.
4. `isLoading` is set to `false`.

---

## Timing and Cancellation

| Aspect | Detail |
|--------|--------|
| Timeout | The API route has a 60-second execution timeout |
| Min glow duration | 1000 ms per node (even if execution is faster) |
| Cancellation | Not supported — closing the chat during execution will orphan the server-side execution until timeout |

---

## Execution Context

The `ExecutionContext` object is threaded through the entire execution:

| Field | Description |
|-------|-------------|
| `workflowId` | Current workflow ID |
| `variables` | Key-value store for inter-node data (e.g., `agentOutput`) |
| `memoryMessages` | Chat messages passed in from the client |
| `currentInput` | The active text being processed |
