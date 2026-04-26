# LLM (AI Service) Node

The LLM node wraps a call to an external AI provider. In a standard workflow it acts as the reasoning engine for the AI Agent — the agent calls it at every step of its decision loop.

---

## Overview

| Property | Value |
|----------|-------|
| Node type | `llm` |
| Handle | Bottom (target — input from AI Agent) |
| Required connections | Must connect to at least one AI Agent node |

---

## Configuration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| Provider | enum | `gemini` | The LLM API to use: **Google Gemini**, **OpenAI**, or **Anthropic** |
| Model | string | (first in list) | The specific model variant. Options depend on the selected provider. |
| API Key | string (masked) | — | Your API key for the selected provider. Stored in browser `localStorage`. |
| System Prompt | string | `"You are a helpful assistant."` | Instructions prepended to every LLM message |
| Temperature | float | `0.7` | Randomness: `0` = deterministic, `2` = highly creative |
| Max Tokens | integer | `1000` | Maximum tokens generated per call (range: 1 – 4000) |

### API Key Storage

API keys are global — they apply to all workflows. Entering a key for a provider in one workflow's LLM node saves it for all workflows.

The key is stored under `localStorage['apiKeys']` as `{ "gemini": "...", "openai": "...", "anthropic": "..." }`. It is never sent to any third-party service other than the provider's own API.

---

## Available Models

### Google Gemini

| Model ID | Notes |
|----------|-------|
| `gemini-2.5-flash` | Fast, efficient |
| `gemini-2.5-flash-lite` | Lightweight variant |
| `gemini-2.5-pro` | Higher capability |
| `gemini-3-flash-preview` | Preview |
| `gemini-3.1-flash-lite-preview` | Preview |
| `gemini-3.1-pro-preview` | Preview |

### OpenAI

| Model ID | Notes |
|----------|-------|
| `gpt-4o` | Latest multimodal flagship |
| `gpt-4-turbo` | Faster GPT-4 |
| `gpt-3.5-turbo` | Cost-efficient |

### Anthropic

| Model ID | Notes |
|----------|-------|
| `claude-opus-4-7` | Most capable |
| `claude-sonnet-4-6` | Balanced |
| `claude-haiku-4-5-20251001` | Fastest / lowest cost |

---

## How It Executes

When the AI Agent calls the LLM node, the executor sends a `POST /api/execute-llm` request:

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "message": "<current step prompt>",
  "systemPrompt": "You are a helpful assistant.",
  "temperature": 0.7,
  "maxTokens": 1000,
  "apiKey": "<from localStorage>"
}
```

The response is:

```json
{ "success": true, "output": "The LLM's text response" }
```

The executor uses [LangChain](https://js.langchain.com/) under the hood (`ChatGoogleGenerativeAI`, `ChatOpenAI`, `ChatAnthropic`).

---

## Connection Rules

| Handle | Direction | Connects to |
|--------|-----------|-------------|
| Bottom | Target (input) | AI Agent (top handle) |

The LLM node only accepts connections from the **top** handle of AI Agent nodes. The canvas rejects all other connection attempts to this handle.

---

## Defaults on Creation

When you click **+ AI Service** in the toolbar:

```json
{
  "label": "AI Service",
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "temperature": 0.7,
  "maxTokens": 1000,
  "systemPrompt": "You are a helpful assistant."
}
```

---

## Error Scenarios

| Situation | Behavior |
|-----------|----------|
| API key not set | Execution fails: `"No API key configured for {provider}"` |
| API returns error | Execution fails with the HTTP error message |
| Provider/model not recognized | Executor throws an unknown-provider error |

---

## Tips

- **System Prompt vs Agent System Prompt:** The LLM node's system prompt is passed to every LLM call, including tool-decision steps. The AI Agent's system prompt is prepended on top of it, making the agent-level prompt the primary behavioral instruction.
- **Temperature 0 for agents:** Setting temperature to `0` makes tool-call decisions more consistent and easier to debug.
- **Max Tokens budget:** For agentic workflows with many steps, keep `maxTokens` moderate (500–1500). Each step only needs to produce a JSON decision or a short final answer.
