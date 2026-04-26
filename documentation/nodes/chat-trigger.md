# Chat Trigger Node

The Chat Trigger node is the **mandatory entry point** of every workflow. It receives the user's message from the chat panel and passes it to the first connected node.

---

## Overview

| Property | Value |
|----------|-------|
| Node type | `chatTrigger` |
| Handle | Source — right side |
| Configurable fields | None |
| Required in workflow | Yes (exactly one) |

---

## What It Does

When the user submits a message in the chat panel, execution begins at the Chat Trigger node. The node:

1. Emits a `node-start` event (triggers the canvas glow effect).
2. Logs the incoming message to the server console.
3. Emits a `node-end` event.
4. Finds its first outgoing edge and delegates execution to the connected node.

If the Chat Trigger has no outgoing edges, it returns the user's message as the final response (the workflow is a pass-through).

---

## Configuration

The Chat Trigger has no configurable fields. Its configuration panel shows a read-only description:

> "This node receives messages from the chat interface and passes them to the next node in the workflow."

---

## Connection Rules

| Handle | Direction | Connects to |
|--------|-----------|-------------|
| Right | Source (output) | AI Agent |

The Chat Trigger can only connect forward. It cannot receive edges from other nodes.

---

## Validation

Workflow validation enforces:

- **Exactly one Chat Trigger must be present.** Submitting a workflow without a Chat Trigger returns: `"Workflow must contain a Chat Trigger node"`.

---

## Example

A minimal valid workflow:

```
[Chat Trigger] ──▶ [AI Agent] ──▶ [LLM]
```

The Chat Trigger passes the user's text to the AI Agent, which uses the LLM to generate a response.

---

## Notes

- Only the **first** outgoing edge is used. If you accidentally connect a Chat Trigger to multiple nodes, only the first edge in the workflow's edge list is followed.
- The node's label is fixed as `"Chat Trigger"` and cannot be renamed.
