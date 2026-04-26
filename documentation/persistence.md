# Persistence

All state in Auth Playground is stored in **browser `localStorage`**. There is no server database. This means:

- Data is private to your browser.
- Clearing browser storage resets everything.
- Data is not shared between browsers or devices.
- Incognito/private windows have separate storage.

---

## Storage Keys Overview

| Key | Contents | Persisted by |
|-----|----------|-------------|
| `workflows` | All workflow definitions | `workflowStore` |
| `currentWorkflow` | Active workflow ID | `workflowStore` |
| `workflowMemories` | Agent chat history (memory) | `workflowStore` |
| `apiKeys` | LLM provider API keys | `workflowStore` |
| `oboTokens` | OBO access tokens with expiry | `workflowStore` |
| `chatMessages:{workflowId}` | Chat message history per workflow | `useChat` |

---

## Workflows (`workflows`)

Stores all workflow definitions.

```json
[
  {
    "id": "workflow-1714123456789-abc123",
    "name": "My Booking Agent",
    "nodes": [ ... ],
    "edges": [ ... ],
    "createdAt": 1714123456789,
    "updatedAt": 1714130000000
  }
]
```

**Operations:**
- Auto-saved whenever you add, remove, or update a node or edge.
- Deleting a workflow also clears its memory (`workflowMemories[workflowId]`).

---

## Current Workflow (`currentWorkflow`)

A single string — the ID of the currently active workflow.

```
"workflow-1714123456789-abc123"
```

---

## Workflow Memory (`workflowMemories`)

Stores per-agent chat history. Used when an AI Agent node has `maxMessages` set.

```json
{
  "workflow-1714123456789-abc123": {
    "node-agent-1": [
      { "id": "msg-1", "role": "user", "content": "Hello", "timestamp": 1714123456789 },
      { "id": "msg-2", "role": "assistant", "content": "Hi there!", "timestamp": 1714123456800 }
    ]
  }
}
```

**Structure:** `workflowId → agentNodeId → ChatMessage[]`

**Behavior:**
- Each new execution appends the user + assistant message pair.
- Only the last `maxMessages` entries are kept.
- Up to 16 messages are sent to the LLM as context per execution (regardless of `maxMessages`).
- Cleared by clicking **Clear Memory** in the AI Agent node configuration panel.
- Cleared when the parent workflow is deleted.

---

## API Keys (`apiKeys`)

Stores LLM provider API keys globally (shared across all workflows).

```json
{
  "gemini": "AIzaSy...",
  "openai": "sk-...",
  "anthropic": "sk-ant-..."
}
```

**Setting a key:** Configure the LLM node in the node panel. The key is saved immediately on input change.

**Deleting a key:** Remove the value from the LLM node's API Key field and save, or clear `localStorage['apiKeys']` manually.

> Keys are passed to server API routes on each execution. They are not stored server-side.

---

## OBO Tokens (`oboTokens`)

Stores OBO access tokens obtained from user consent flows.

```json
{
  "workflow-1714123456789-abc123_node-mcp-1": {
    "accessToken": "eyJhbGciOiJSUzI1NiJ9...",
    "expiresAt": 1714127056789
  }
}
```

**Key format:** `{workflowId}_{nodeId}`

**Expiry:** The `expiresAt` timestamp is checked before every execution. If `Date.now() > expiresAt`, the token is treated as missing and the consent flow restarts.

**Clearing tokens:**
- Automatically triggered when a new consent flow starts (old token is replaced).
- Call `workflowStore.clearOBOTokens(workflowId)` to remove all OBO tokens for a workflow.
- Cleared when the parent workflow is deleted.

---

## Chat Messages (`chatMessages:{workflowId}`)

Stores the chat message history for each workflow independently.

```json
[
  {
    "id": "msg-1714123456789-xyz",
    "role": "user",
    "content": "Book me a flight to London",
    "timestamp": 1714123456789,
    "workflowId": "workflow-1714123456789-abc123"
  },
  {
    "id": "msg-1714123456900-xyz",
    "role": "assistant",
    "content": "I found 3 flights to London...",
    "timestamp": 1714123456900,
    "workflowId": "workflow-1714123456789-abc123"
  }
]
```

**Auto-saved:** Messages are persisted to `localStorage` after every state update via a `useEffect` in `useChat`.

**Loaded on mount:** When the app loads, existing messages for the current workflow are restored from `localStorage`.

**Clearing:** Click the clear button in the chat panel header. This removes messages from both state and `localStorage`, and also resets OBO state and the active node set.

---

## Managing Storage

### Viewing stored data

Open browser DevTools → Application → Local Storage → `http://localhost:3000`.

### Clearing all data

```javascript
localStorage.clear()
```

Or use the browser's "Clear site data" option in DevTools.

### Clearing a specific workflow

```javascript
const workflows = JSON.parse(localStorage.getItem('workflows') || '[]')
const filtered = workflows.filter(w => w.id !== 'workflow-to-delete')
localStorage.setItem('workflows', JSON.stringify(filtered))
localStorage.removeItem('chatMessages:workflow-to-delete')
// Also clean up memories and OBO tokens for that workflow
```

### Exporting a workflow

```javascript
const workflows = JSON.parse(localStorage.getItem('workflows') || '[]')
const target = workflows.find(w => w.name === 'My Workflow')
console.log(JSON.stringify(target, null, 2))
```

### Importing a workflow

```javascript
const imported = { id: '...', name: '...', nodes: [...], edges: [...], createdAt: Date.now(), updatedAt: Date.now() }
const workflows = JSON.parse(localStorage.getItem('workflows') || '[]')
workflows.push(imported)
localStorage.setItem('workflows', JSON.stringify(workflows))
```

---

## Storage Size Limits

Browser `localStorage` is limited to approximately **5 MB** per origin. In practice this is rarely a concern for workflow definitions, but chat history with many long responses can grow over time. Use the **Clear** button in the chat panel periodically if needed.
