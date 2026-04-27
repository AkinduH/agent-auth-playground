# MCP Client

The MCP Client node connects your AI Agent to an external tool server that implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). Once connected, the agent can discover and call that server's tools as part of its reasoning loop.

---

## Connections

| Handle | Direction | Connects to |
|--------|-----------|-------------|
| Left | Input | AI Agent (right handle) |

Connect one or more MCP Client nodes to the **right handle** of an AI Agent. The agent sees all tools from all connected MCP servers as one unified list.

---

## Configuration

Double-click the MCP Client node to open its configuration.

### Basic

| Field | Required | Description |
|-------|----------|-------------|
| **MCP Server Name** | No | A friendly label shown in the auth flow diagram. Defaults to the node ID if left blank. |
| **MCP Server Endpoint** | **Yes** | The URL of the MCP server (e.g., `https://my-tools.example.com/mcp`). |

### Authentication

By default, MCP connections are unauthenticated. Toggle **Use MCP OAuth2** to enable authentication via [Asgardeo](https://wso2.com/asgardeo/).

| Field | Default | Description |
|-------|---------|-------------|
| **Use MCP OAuth2** | Off | Enable Asgardeo OAuth2 authentication before connecting |
| **Auth Flow** | Agent | Choose **Agent** (agent authenticates itself) or **OBO** (agent acts on behalf of the logged-in user) |
| **Organization Name** | — | Your Asgardeo tenant name (e.g., `my-company`) |
| **Client ID** | — | OAuth2 application client ID registered in Asgardeo |
| **Redirect URI** | — | The callback URL registered in your Asgardeo application |
| **Scope** | `openid` | Space-separated OAuth2 scopes (e.g., `openid read_bookings`) |

> You need to configure the **Agent ID and Secret** on the **AI Agent** node, not here. The MCP Client reads them from the connected agent automatically.

---

## Auth Flows

### No authentication (default)

The MCP Client connects to the server with no authorization header. Use this for local development servers, public MCP endpoints, or any server that doesn't require authentication.

### Agent Flow

The agent authenticates with its own service-account credentials before connecting. No user interaction is required.

**When to use:** The MCP server is a protected API and the agent acts autonomously (no user identity needs to be forwarded).

**What you need:**
- `Use MCP OAuth2` → on, `Auth Flow` → Agent
- Organization Name, Client ID, Redirect URI, Scope filled in
- **Agent ID** and **Agent Secret** on the connected AI Agent node

When the workflow runs, the agent authenticates with Asgardeo silently and obtains an access token. All tool calls include that token as an authorization header.

### OBO Flow (On-Behalf-Of)

The agent acts on behalf of you (the logged-in user). You must grant consent before the first message is processed.

**When to use:** The MCP server enforces per-user authorization. The request must carry the user's identity.

**What you need:**
- `Use MCP OAuth2` → on, `Auth Flow` → OBO
- Organization Name, Client ID, Redirect URI, Scope filled in
- **Agent ID** and **Agent Secret** on the connected AI Agent node
- A Redirect URI accessible in your browser (for the consent popup)

When you send your first message, the chat panel shows an **Authorize** button. Clicking it opens a login popup where you authenticate with Asgardeo and grant consent. The resulting token is saved in your browser and reused for subsequent messages until it expires.

---

## Multiple MCP Clients

You can connect multiple MCP Client nodes to a single AI Agent. The agent sees all tools from all servers as one combined list.

---