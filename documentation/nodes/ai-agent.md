# AI Agent

The AI Agent is the reasoning engine of your workflow. It receives your message, consults an AI model (via the connected AI Service), and decides what to do - call a tool, call another tool, or give a final answer.

---

## Connections

| Handle | Direction | Connects to |
|--------|-----------|-------------|
| Left | Input | Chat Trigger |
| Top | Output | AI Service (required) |
| Right | Output | MCP Client (optional, one or more) |

The **top handle - AI Service** connection is required. The agent cannot run without an AI model to consult.

The **right handle - MCP Client** connections are optional. Add them when you want the agent to be able to call external tools.

---

## Configuration

Double-click the AI Agent node to open its configuration.

### Identity

| Field | Required | Description |
|-------|----------|-------------|
| **Agent Name** | No | A friendly label shown in the auth flow diagram and logs |
| **Agent ID** | Only if using OAuth2 | The agent username used to authenticate with Asgardeo |
| **Agent Secret** | Only if using OAuth2 | The password for the Agent ID to authenticate with Asgardeo |

To get an Agent ID and Secret, create a new agent in your Asgardeo dashboard. Refer the [Register and Manage Agents](https://wso2.com/asgardeo/docs/guides/agentic-ai/ai-agents/register-and-manage-agents/) for detailed instructions.

Agent ID and Agent Secret are only needed when a connected MCP Client node has OAuth2 enabled. See [Auth Flows](../auth-flows.md) for details.

### Behavior

| Field | Default | Description |
|-------|---------|-------------|
| **System Prompt** | `You are a helpful assistant.` | Instructions sent to the AI model on every step. Use this to define the agent's persona, tone, and constraints. |
| **Max Tool Steps** | `6` | How many tool calls the agent can make before it must produce a final answer. Range: 1–12. |

### Memory

| Field | Default | Description |
|-------|---------|-------------|
| **Messages to Keep** | (empty) | If set, the last N conversations are saved and provided as context the next time you send a message. Leave empty to disable memory. |

---

## Tips

- **System Prompt first** — the clearest way to shape your agent's behavior is a well-written system prompt. Be specific about what the agent should and shouldn't do.
- **Max Tool Steps** — start with the default (6) and increase only if your workflows regularly run out of steps. More steps means longer execution time.
- **Memory** — useful for conversational agents where context from previous messages matters. For stateless task automation, leave it disabled.
