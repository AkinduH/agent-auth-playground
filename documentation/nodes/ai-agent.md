# AI Agent Node

The AI Agent node is the core reasoning engine of a workflow. It runs an autonomous decision loop — consulting the LLM at each step to decide whether to call a tool or produce a final answer.

---

## Overview

| Property | Value |
|----------|-------|
| Node type | `aiAgent` |
| Handles | Left (input), Top (to LLM), Right (to MCP Clients) |
| Required connections | Must connect to exactly one LLM node via **top** handle |
| Optional connections | Zero or more MCP Client nodes via **right** handle |

---

## Configuration Fields

### Identity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Agent Name | string | No | Friendly display name used in logs and the auth flow diagram |
| Agent ID | string | OAuth2 only | Service-account username for Asgardeo authentication |
| Agent Secret | string (masked) | OAuth2 only | Password for the Agent ID; only required when an MCP Client node has OAuth2 enabled |

> Agent ID and Agent Secret are consumed by connected MCP Client nodes configured for OAuth2. The agent itself does not authenticate — the MCP Client nodes do on the agent's behalf.

---

### Behavior

| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| System Prompt | string | `"You are a helpful assistant."` | — | Instructions prepended to every LLM call the agent makes. Defines persona, constraints, and domain rules. |
| Temperature | float | `0.7` | 0 – 2 | Controls LLM output randomness. `0` is deterministic; `2` is highly creative. |
| Max Tokens | integer | `1000` | 1 – 4000 | Maximum tokens the LLM may generate per call. |
| Max Tool Steps | integer | `6` | 1 – 12 | Maximum number of tool-call iterations before the agent is forced to produce a final answer. Clamped automatically. |

---

### Memory

| Field | Type | Default | Range | Description |
|-------|------|---------|-------|-------------|
| Messages to Keep | integer | (empty) | 1 – 100 | If set, the last N chat messages are stored in `localStorage` and prepended as context for the next execution. Leave empty to disable memory. |

When memory is enabled, the configuration panel shows:
- **"N message(s) currently saved"** — the current stored count.
- **Clear Memory** button — wipes stored messages for this agent in this workflow.

Up to **16** messages from the stored history are forwarded to the LLM per execution, even if `maxMessages` is set higher.

---

## Execution Loop

The agent loop runs up to `maxToolSteps` iterations. Each iteration:

```
Step N of maxToolSteps:
  1. Build a prompt containing:
     - The user's current request
     - Memory context (last ≤16 stored messages)
     - Available tool schemas (name, description, parameters)
     - Execution log from previous steps
  2. Call the LLM with the agent system prompt + step prompt
  3. Parse the LLM response as JSON:
     - { "type": "final", "response": "..." }  → return response, end loop
     - { "type": "tool", "name": "...", "arguments": {...} }  → call tool, continue
  4. If unparseable → return raw LLM text
```

If all `maxToolSteps` are exhausted without a `"final"` decision, the agent makes one more LLM call with a fallback prompt that instructs the LLM to synthesize a final answer from the tool results so far.

### LLM Response Format

The agent instructs the LLM to respond with **exactly one JSON object**:

```json
{ "type": "final", "response": "The answer is 42." }
```

or

```json
{ "type": "tool", "name": "tool_name", "arguments": { "key": "value" } }
```

Any other output is treated as a final plain-text response.

---

## Tool Binding

When the agent connects to MCP Client nodes, all discovered tools are bound before execution. Tool names are normalized:

- Lowercase, alphanumeric and underscores only.
- Deduplicated: if two MCP servers expose a tool with the same normalized name, the second gets a `_2` suffix.
- Truncated to 64 characters.

The original MCP tool name is preserved internally and used for the actual tool call.

---

## Memory Storage

Memory is keyed by **workflow ID** + **agent node ID**. This means:
- Multiple agents in the same workflow each have independent memory.
- Memory persists across browser sessions.
- Clearing the workflow does not automatically clear memory — use the **Clear Memory** button in the node panel, or clear `localStorage` manually.

See [Persistence](../persistence.md) for the full storage schema.

---

## Connection Rules

| Handle | Direction | Connects to |
|--------|-----------|-------------|
| Left | Target (input) | Chat Trigger |
| Top | Source (output) | **LLM only** (enforced by canvas) |
| Right | Source (output) | **MCP Client only** (enforced by canvas) |

The canvas blocks invalid connections: dragging the **top** handle to anything other than an LLM node will be rejected.

---

## Validation

Before execution, the workflow validator checks:

- Every AI Agent node must have an outgoing edge to an LLM node.
  - Error: `"AI Agent node {nodeId} must connect to an AI Service node"`

---

## Defaults on Creation

When you click **+ AI Agent** in the toolbar:

```json
{
  "label": "AI Agent",
  "systemPrompt": "You are a helpful assistant.",
  "temperature": 0.7,
  "maxTokens": 1000,
  "maxToolSteps": 6
}
```

---

## Error Scenarios

| Situation | Behavior |
|-----------|----------|
| LLM is not connected | Validation error before execution starts |
| LLM call fails | Executor throws; workflow returns error |
| Tool not found (LLM hallucinated name) | Logs warning, appends error to execution log, continues to next step |
| Tool call fails (MCP error) | Logs error, appends error to execution log, continues to next step |
| All steps exhausted | One final LLM call with fallback prompt to synthesize an answer |
| LLM returns unparseable JSON | Raw text returned immediately as final response |
