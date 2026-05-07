# Travel Agent — Setup Guide

A full-featured travel assistant AgentFlow that demonstrates authenticated and unauthenticated MCP tool usage. The agent can search flights, search hotels, convert currencies, create bookings, and reserve airport lounges - with Booking Manager and Airport Lounge Manager are protected by Asgardeo / WSO2 Identity Server OAuth2.

## Workflow Overview

![Travel Agent Flow](../../public/travel-agent-flow.png)

---

## Step 1 — Load the Workflow

1. Open **agent-auth-playground** (`npx agent-auth-playground`, then navigate to `http://localhost:4829`).
2. Click **Import** in the top toolbar and select [travel-agent.json](travel-agent.json).
3. The canvas loads with the pre-wired nodes. Continue through the steps below to fill in the empty configuration fields.

---

## Step 2 — Configure the AI Service Node

Double-click the **AI Service** node and select your preferred LLM provider, model, and credentials.

For full configuration details, see [this guide](../../documentation/nodes/llm.md).

---

## Step 3 — Set Up an Identity Provider

The two protected MCP servers (Booking Manager, Airport Lounge) require OAuth2 tokens issued by an identity provider. Pick one:

**Option A — Asgardeo (cloud)**
Sign up for a free account at [asgardeo.io](https://asgardeo.io/). Your organization base URL will be `https://api.asgardeo.io/t/<your-org>`.

**Option B — WSO2 Identity Server (self-hosted)**
Download and install WSO2 IS from the [official downloads page](https://wso2.com/products/downloads/?product=wso2is). Your base URL will typically be `https://localhost:9443`.

---

## Step 4 — Configure the AI Agent Node

The AI Agent node needs credentials so it can authenticate with Asgardeo / WSO2 IS on behalf of itself (Agent Flow) and on behalf of you (OBO Flow).

1. Register an Interactive AI Agent by following the [Asgardeo guide](https://wso2.com/asgardeo/docs/guides/agentic-ai/ai-agents/register-and-manage-agents/#registering-an-ai-agent). Set the callback URL to `http://localhost:4829` during registration. Enable **PKCE** and **Public client** on the agent application.
2. Double-click the **AI Agent** node.
3. In the **+ Add Agent Credentials** section, fill in:

   | Field | Value |
   |-------|-------|
   | **Name** | Any label, e.g. `Travel-Agent` |
   | **Agent ID** | The Agent ID from your Asgardeo registration |
   | **Agent Secret** | The corresponding Agent Secret |
   | **Base URL** | Your Asgardeo org URL or WSO2 IS URL |
   | **Agent Application Client ID** | The OAuth2 application client ID |

4. Click **Save**, then click **Test Fetching an Agent Token** to verify the credentials work.

For full configuration details, see [this guide](../../documentation/nodes/ai-agent.md).

---
