# Streaming Protocol

Workflow execution uses **Server-Sent Events (SSE)** to stream real-time progress back to the browser. This enables live node highlighting on the canvas and allows the chat response to appear as soon as the final answer is ready.

---

## Endpoint

```
POST /api/execute-workflow
```

**Response headers:**

```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

The `X-Accel-Buffering: no` header prevents nginx (if used as a reverse proxy) from buffering the stream.

---

## Event Format

Each event is a single line starting with `data:` followed by a JSON payload, terminated by two newlines:

```
data: {"type":"node-start","nodeId":"node-1234567890-abc"}

data: {"type":"node-end","nodeId":"node-1234567890-abc"}

data: {"type":"result","success":true,"output":"...","executionTime":1500,"trace":{...}}

```

---

## Event Types

### `node-start`

Emitted immediately before a node begins execution.

```json
{ "type": "node-start", "nodeId": "node-1234567890-abc" }
```

**Nodes that emit this event:** Chat Trigger, AI Agent, LLM (when called directly), MCP Client (during tool calls).

### `node-end`

Emitted immediately after a node finishes execution (or fails).

```json
{ "type": "node-end", "nodeId": "node-1234567890-abc" }
```

### `result`

The final event. Always the last event in the stream.

**Success:**

```json
{
  "type": "result",
  "success": true,
  "output": "The assistant's response text",
  "executionTime": 1500,
  "trace": { ... }
}
```

**Failure:**

```json
{
  "type": "result",
  "success": false,
  "output": null,
  "error": "Workflow must contain a Chat Trigger node",
  "executionTime": 12,
  "trace": { "flow": "none", "mcps": [], "tools": [] }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether execution completed successfully |
| `output` | string \| null | The final text response from the workflow |
| `error` | string | Present only when `success: false` |
| `executionTime` | number | Total execution time in milliseconds |
| `trace` | WorkflowTrace | Structured auth and tool-call trace (see [Auth Flow Diagram](auth-flow-diagram.md)) |

---

## Client-Side Parsing

`useChat.ts` reads the stream incrementally:

```typescript
const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })

  // Process complete events (separated by double newline)
  let sepIndex
  while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
    const rawEvent = buffer.slice(0, sepIndex)
    buffer = buffer.slice(sepIndex + 2)

    const line = rawEvent.split('\n').find(l => l.startsWith('data:'))
    if (!line) continue

    const parsed = JSON.parse(line.slice(5).trim())
    handleEvent(parsed)
  }
}
```

---

## Active Node Glow Effect

`node-start` and `node-end` events drive the canvas glow animation.

### Timing Logic

```
MIN_GLOW_MS = 1000

On node-start(nodeId):
  Clear any pending removal timer for nodeId
  Record startTime[nodeId] = Date.now()
  Add nodeId to activeNodeIds

On node-end(nodeId):
  elapsed = Date.now() - startTime[nodeId]
  if elapsed >= MIN_GLOW_MS:
    Immediately remove nodeId from activeNodeIds
  else:
    Schedule removal after (MIN_GLOW_MS - elapsed) ms
```

This guarantees that every active node glows for **at least 1 second**, even if the node completes in under a millisecond. This makes fast tool lookups visible on the canvas.

### Canvas Integration

Each node receives an `isActive` prop equal to `activeNodeIds.has(node.id)`. When `isActive` is `true`, the `ActiveBorder` component renders a pulsing ring around the node.

---

## Error Handling

Validation errors and unexpected exceptions are **not** returned as HTTP error responses. They are always sent as a `result` SSE event with `success: false`. This keeps the client parsing logic simple — it only needs to handle the SSE stream.

```
Validation failure:
  data: {"type":"result","success":false,"error":"Workflow must contain a Chat Trigger node",...}

Unexpected exception:
  data: {"type":"result","success":false,"error":"...","executionTime":...}
```

---

## Timeout

The API route enforces a **60-second timeout** on the `ReadableStream`. If a workflow has not completed within 60 seconds, the stream closes. The client's `reader.read()` returns `done: true` without a `result` event in this case — the chat shows no response and `isLoading` remains `true` until the component unmounts.
