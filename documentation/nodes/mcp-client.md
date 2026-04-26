# MCP Client Node

The MCP Client node connects to a [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server, discovers its tools, and makes them available to the AI Agent. It supports both unauthenticated connections and two OAuth2 authentication flows.

---

## Overview

| Property | Value |
|----------|-------|
| Node type | `mcpClient` |
| Handle | Left (target — input from AI Agent right handle) |
| Required fields | `mcpServerEndpoint` |

---

## Configuration Fields

### Basic

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| MCP Server Name | string | No | Friendly label shown in the auth flow diagram instead of the node ID |
| MCP Server Endpoint | URL | **Yes** | The HTTP(S) URL of the MCP server. The client uses Streamable HTTP transport. |

### OAuth2

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Use MCP OAuth2 | boolean | `false` | Enable Asgardeo authentication before connecting |
| Auth Flow | enum | `agent` | `agent` — Agent authenticates with its own credentials. `obo` — Agent acts on behalf of a logged-in user. |
| Organization Name | string | — | Your Asgardeo tenant name (e.g., `my-company`) |
| Client ID | string | — | OAuth2 application client ID registered in Asgardeo |
| Redirect URI | URL | — | The callback URL registered in Asgardeo (e.g., `https://example.com/callback`) |
| Scope | string | `openid` | Space-separated OAuth2 scopes (e.g., `openid read_bookings`) |

> **Agent ID and Secret** are **not** configured on the MCP Client node. They are taken from the connected AI Agent node's **Agent ID** and **Agent Secret** fields.

---

## Auth Flows

### No OAuth2 (default)

The client connects directly to the MCP server with no authorization header. Suitable for local development servers or public MCP endpoints.

### Agent Flow (`oauth2Flow: 'agent'`)

The system authenticates the agent itself before connecting. No user interaction is required.

**Prerequisites:**
- `useOAuth2: true`, `oauth2Flow: 'agent'`
- Connected AI Agent node must have **Agent ID** and **Agent Secret** filled in
- All OAuth2 config fields (Organization Name, Client ID, Redirect URI, Scope)

**What happens:**
1. The executor runs a 3-step PKCE flow against Asgardeo using the agent's credentials.
2. An access token is obtained.
3. All MCP tool calls include `Authorization: Bearer <token>`.

See [Auth Flows — Agent Flow](../auth-flows.md#agent-oauth2-flow) for the full technical detail.

### OBO Flow (`oauth2Flow: 'obo'`)

The agent acts on behalf of a real user. The user must grant consent before the first message is processed.

**Prerequisites:**
- `useOAuth2: true`, `oauth2Flow: 'obo'`
- Connected AI Agent node must have **Agent ID** and **Agent Secret** filled in
- All OAuth2 config fields

**What happens:**
1. When the user sends their first message, the chat panel shows an **Authorize** button.
2. The user clicks it, logs in to Asgardeo, and grants consent.
3. The resulting OBO token is exchanged and stored in `localStorage`.
4. Tool calls proceed with the OBO token, which carries the user's identity.
5. The token is reused for subsequent messages until it expires.

See [Auth Flows — OBO Flow](../auth-flows.md#obo-on-behalf-of-flow) for the full technical detail.

---

## Tool Discovery

On connection, the MCP Client fetches the server's tool list via the MCP protocol (`listTools`). Tools are cached after the first fetch. Each tool has:

- `name` — original name from the server
- `description` — human-readable description forwarded to the LLM
- `inputSchema` — JSON Schema for the tool's arguments

### Tool Name Normalization

Before tools are exposed to the AI Agent, their names are normalized:

1. Lowercase the entire name.
2. Replace any non-alphanumeric character with `_`.
3. Collapse consecutive underscores.
4. Trim leading and trailing underscores.
5. If the name starts with a digit, prepend `tool_`.
6. Truncate to 64 characters.
7. If two tools from different MCP servers produce the same normalized name, append `_2`, `_3`, etc.

The original name is kept internally for the actual MCP tool call.

---

## Connection and Reconnection

The client uses **Streamable HTTP transport** (the MCP HTTP streaming protocol). If the connection drops, it retries automatically:

| Parameter | Value |
|-----------|-------|
| Initial retry delay | 1 second |
| Max retry delay | 10 seconds |
| Backoff factor | 1.5× |
| Max retries | 2 |

---

## Connection Rules

| Handle | Direction | Connects to |
|--------|-----------|-------------|
| Left | Target (input) | AI Agent (right handle) |

The MCP Client can only connect from the **right** handle of AI Agent nodes.

---

## Validation

Before execution:

- Every MCP Client node must have a non-empty `mcpServerEndpoint`.
  - Error: `"MCP Client node {nodeId} requires a server endpoint"`
- If `useOAuth2: true` and `oauth2Flow: 'agent'`:
  - Organization Name, Client ID, and Redirect URI must all be provided.
  - The connected AI Agent must have Agent ID and Agent Secret.
- If `useOAuth2: true` and `oauth2Flow: 'obo'`:
  - Same OAuth2 config fields required.
  - OBO token must be present in `localStorage` at execution time (obtained via the consent flow in chat).

---

## Defaults on Creation

When you click **+ MCP Client** in the toolbar:

```json
{
  "label": "MCP Client",
  "mcpServerEndpoint": ""
}
```

---

## Error Scenarios

| Situation | Behavior |
|-----------|----------|
| Endpoint is empty | Validation error before execution |
| Endpoint is not a valid URL | `"Invalid MCP server endpoint: {url}"` |
| Server unreachable | Retries up to 2 times, then: `"Unable to connect to MCP server at {url}: {error}"` |
| OAuth2 config incomplete | `"[MCPClient:{id}] {field} is required"` |
| Agent ID/Secret missing on agent node | `"[MCPClient:{id}] Agent ID/Secret required on connected AI Agent"` |
| OBO token missing at runtime | `"[MCPClient:{id}] OBO token not found. User authorization required."` |

---

## Multiple MCP Clients

You can connect multiple MCP Client nodes to a single AI Agent. The agent sees all tools from all connected servers as one unified list. Tool names are deduplicated automatically.

```
AIAgent ──▶ MCP Client A  (exposes: search_flights, book_flight)
       └──▶ MCP Client B  (exposes: check_hotel, book_hotel)
```

The agent can call tools from any connected server within a single execution.
