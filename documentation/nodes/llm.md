# AI Service

The AI Service node connects your workflow to an external AI model. The AI Agent calls it at each step of its reasoning loop to decide what to do next.

---

## Connections

| Handle | Direction | Connects to |
|--------|-----------|-------------|
| Bottom | Input | AI Agent (top handle) |

The AI Service only accepts connections from the **top handle** of AI Agent nodes.

---

## Configuration

Click the AI Service node to configure it in the right panel.

| Field | Default | Description |
|-------|---------|-------------|
| **Provider** | Gemini | The AI company whose API you want to use: Google Gemini, OpenAI, or Anthropic |
| **Model** | `gemini-2.5-flash` | The specific model variant. Options update automatically when you change the provider. |
| **API Key** | — | Your API key for the selected provider. Stored in your browser only. |
| **Temperature** | `0.7` | Creativity level: `0` = consistent, `2` = highly varied |
| **Max Tokens** | `1000` | Maximum tokens the model can generate per response (range: 1–4000) |

### API Keys

Your API key is saved globally - entering it once makes it available to all workflows. It is stored in your browser and never sent anywhere except to the AI provider's own API.

---

## Tips

- **Temperature for agents** — setting Temperature to `0` makes the agent's tool-calling decisions more predictable and easier to debug.
- **Max Tokens for agents** — each agent step only needs to produce a short JSON response (`call this tool` or `final answer`). Keeping Max Tokens at 500–1500 is usually sufficient and faster.
- **Switching providers** — you can change the provider and model at any time. Existing API keys for other providers are preserved.
