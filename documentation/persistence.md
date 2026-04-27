# Your Data

Auth Playground stores everything in your **browser's local storage**. There is no server database, no account, and no data sent anywhere except to the AI provider APIs you configure.

---

## What This Means for You

- **Private by default** — your workflows and API keys are visible only to you, in this browser.
- **No sync** — data is not shared between different browsers or devices.
- **Incognito windows** — have their own separate storage; nothing carries over.
- **Clearing browser data resets everything** — use the in-app controls if you only want to clear specific things.

---

## What Gets Stored

| What | Where it lives |
|------|---------------|
| Workflows (nodes, edges, layout) | Browser local storage |
| Chat message history | Browser local storage, per workflow |
| AI Agent memory (conversation context) | Browser local storage, per agent |
| LLM API keys | Browser local storage, shared across all workflows |
| OBO authorization tokens | Browser local storage, per workflow per MCP node |

---

## API Keys

API keys are global — entering a key for Gemini in one workflow makes it available in all your workflows. The key is stored in your browser and is only sent to that provider's API when a workflow runs.

To remove an API key, clear the API Key field in any AI Service node and the change is saved immediately.

---

## Agent Memory

When an AI Agent node has **Messages to Keep** set, recent conversations are saved and provided as context the next time you chat. This lets the agent remember things you told it in past sessions.

To clear an agent's memory:
1. Select the AI Agent node on the canvas.
2. Click **Clear Memory** in the configuration panel.

Memory is cleared automatically when you delete the workflow.

---

## OBO Tokens

When you complete the OBO authorization flow (logging in and granting consent), the resulting token is saved in your browser until it expires. Once expired, you'll be prompted to authorize again.

Tokens are cleared automatically when the associated workflow is deleted.

---

## Chat History

Each workflow has its own independent chat history. To clear the chat:
- Click the clear button in the chat panel header.

This removes the messages from your browser and also resets any in-progress authorization state.

---

## Storage Limits

Browser local storage is limited to approximately **5 MB** per site. Workflow definitions and settings take very little space. Long conversations with many messages can grow over time — if you notice things slowing down, use the chat clear button periodically.

---

## Clearing Everything

To wipe all Auth Playground data:

1. Open your browser's DevTools (usually F12).
2. Go to **Application** → **Local Storage**.
3. Find the entry for this site and click **Clear**.

Or use your browser's "Clear site data" option in its settings.
