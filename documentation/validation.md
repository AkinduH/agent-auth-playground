# Workflow Validation

Every workflow is validated before execution. Validation runs server-side in `lib/workflowValidation.ts` immediately after the `POST /api/execute-workflow` request is received. If any check fails, the entire workflow is rejected — no nodes execute.

---

## Validation Rules

### 1. At Least One Node

```
workflow.nodes.length > 0
```

Error: `"Workflow must contain at least one node"`

---

### 2. Chat Trigger Required

```
workflow.nodes.some(n => n.type === 'chatTrigger')
```

Error: `"Workflow must contain a Chat Trigger node"`

Every workflow must start with a Chat Trigger. It is the only valid entry point.

---

### 3. All Edges Reference Valid Nodes

```
For every edge in workflow.edges:
  workflow.nodes.find(n => n.id === edge.source) must exist
  workflow.nodes.find(n => n.id === edge.target) must exist
```

Error: `"Edge {edgeId} references a missing source node"` or `"Edge {edgeId} references a missing target node"`

This guards against stale edge data (e.g., if a node was deleted but the edge was not cleaned up).

---

### 4. All Non-Trigger Nodes Are Connected

```
For every node where node.type !== 'chatTrigger':
  Must have at least one incoming OR outgoing edge
```

Error: `"Node {label} ({nodeId}) is not connected to the workflow"`

Isolated nodes (no edges at all) are rejected. This prevents accidentally leaving unused nodes on the canvas that would never execute but might confuse debugging.

---

### 5. MCP Client Nodes Have an Endpoint

```
For every node where node.type === 'mcpClient':
  node.data.mcpServerEndpoint.trim() must be non-empty
```

Error: `"MCP Client node {nodeId} requires a server endpoint"`

---

### 6. AI Agent Connects to an LLM Node

```
For every node where node.type === 'aiAgent':
  Must have an outgoing edge to a node with type === 'llm'
```

Error: `"AI Agent node {nodeId} must connect to an AI Service node"`

The agent cannot function without an LLM to consult. This error is raised even if the agent has no MCP tools.

---

## Error Response Format

Validation errors are returned as an SSE `result` event:

```json
{
  "type": "result",
  "success": false,
  "error": "Invalid workflow: Workflow must contain a Chat Trigger node, AI Agent node node-123 must connect to an AI Service node",
  "executionTime": 1,
  "trace": { "flow": "none", "startedAt": 0, "mcps": [], "tools": [] }
}
```

Multiple errors are joined with `", "`.

---

## Valid Workflow Checklist

Before running a workflow, confirm:

- [ ] At least one node exists on the canvas
- [ ] Exactly one **Chat Trigger** node is present
- [ ] Every **AI Agent** has its **top** handle connected to an **LLM** node
- [ ] Every **MCP Client** has an **MCP Server Endpoint** filled in
- [ ] Every non-trigger node is connected by at least one edge
- [ ] No edges reference deleted nodes (the canvas handles this automatically)

---

## Runtime Errors (Not Caught by Validation)

These issues are not detected by the pre-execution validator but will cause execution to fail:

| Issue | Error |
|-------|-------|
| Missing LLM API key | `"No API key configured for {provider}"` |
| Invalid MCP endpoint URL | `"Invalid MCP server endpoint: {url}"` |
| MCP server unreachable | `"Unable to connect to MCP server at {url}: {error}"` |
| Missing OAuth2 config on MCP Client | `"[MCPClient:{id}] {field} is required"` |
| Agent ID/Secret missing (required for OAuth2) | `"[MCPClient:{id}] Agent ID/Secret required on connected AI Agent"` |
| OBO token missing or expired at runtime | `"[MCPClient:{id}] OBO token not found. User authorization required."` |
