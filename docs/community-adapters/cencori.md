---
title: Cencori
id: cencori-adapter
order: 3
---

The Cencori adapter provides access to 14+ AI providers (OpenAI, Anthropic, Google, xAI, and more) through a unified interface with built-in security, observability, and cost tracking.

## Installation

```bash
npm install @cencori/ai-sdk
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { cencori } from "@cencori/ai-sdk/tanstack";

const adapter = cencori("gpt-4o");

for await (const chunk of chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
})) {
  if (chunk.type === "content") {
    console.log(chunk.delta);
  }
}
```

## Configuration

```typescript
import { createCencori } from "@cencori/ai-sdk/tanstack";

const cencori = createCencori({
  apiKey: process.env.CENCORI_API_KEY!,
  baseUrl: "https://cencori.com", // Optional
});

const adapter = cencori("gpt-4o");
```

## Streaming

```typescript
import { chat } from "@tanstack/ai";
import { cencori } from "@cencori/ai-sdk/tanstack";

const adapter = cencori("claude-3-5-sonnet");

for await (const chunk of chat({
  adapter,
  messages: [{ role: "user", content: "Tell me a story" }],
})) {
  if (chunk.type === "content") {
    process.stdout.write(chunk.delta);
  } else if (chunk.type === "done") {
    console.log("\nDone:", chunk.finishReason);
  }
}
```


## Tool Calling

```typescript
import { chat } from "@tanstack/ai";
import { cencori } from "@cencori/ai-sdk/tanstack";

const adapter = cencori("gpt-4o");

for await (const chunk of chat({
  adapter,
  messages: [{ role: "user", content: "What's the weather in NYC?" }],
  tools: {
    getWeather: {
      name: "getWeather",
      description: "Get weather for a location",
      inputSchema: {
        type: "object",
        properties: { location: { type: "string" } },
      },
    },
  },
})) {
  if (chunk.type === "tool_call") {
    console.log("Tool call:", chunk.toolCall);
  }
}
```


## Multi-Provider Support

Switch between providers with a single parameter:

```typescript
import { cencori } from "@cencori/ai-sdk/tanstack";

// OpenAI
const openai = cencori("gpt-4o");

// Anthropic
const anthropic = cencori("claude-3-5-sonnet");

// Google
const google = cencori("gemini-2.5-flash");

// xAI
const grok = cencori("grok-3");

// DeepSeek
const deepseek = cencori("deepseek-v3.2");
```

All responses use the same unified format regardless of provider.

## Supported Models

| Provider | Models |
|----------|--------|
| OpenAI | `gpt-5`, `gpt-4o`, `gpt-4o-mini`, `o3`, `o1` |
| Anthropic | `claude-opus-4`, `claude-sonnet-4`, `claude-3-5-sonnet` |
| Google | `gemini-3-pro`, `gemini-2.5-flash`, `gemini-2.0-flash` |
| xAI | `grok-4`, `grok-3` |
| Mistral | `mistral-large`, `codestral`, `devstral` |
| DeepSeek | `deepseek-v3.2`, `deepseek-reasoner` |
| + More | Groq, Cohere, Perplexity, Together, Qwen, OpenRouter |

## Environment Variables

```bash
CENCORI_API_KEY=csk_your_api_key_here
```

## Getting an API Key

1. Go to [Cencori](https://cencori.com)
2. Create an account and generate an API key
3. Add it to your environment variables

## Why Cencori?

- **🔒 Security** — PII filtering, jailbreak detection, content moderation
- **📊 Observability** — Request logs, latency metrics, cost tracking
- **💰 Cost Control** — Budgets, alerts, per-route analytics
- **🔌 Multi-Provider** — One API key for 14+ AI providers
- **🛠️ Tool Calling** — Full support for function calling across providers
- **🔄 Failover** — Automatic retry and fallback to alternative providers

## API Reference

### `cencori(model)`

Creates a Cencori adapter using environment variables.

**Parameters:**

- `model` - Model name (e.g., `"gpt-4o"`, `"claude-3-5-sonnet"`, `"gemini-2.5-flash"`)

**Returns:** A Cencori TanStack AI adapter instance.

### `createCencori(config)`

Creates a custom Cencori adapter factory.

**Parameters:**

- `config.apiKey` - Your Cencori API key
- `config.baseUrl?` - Custom base URL (optional)

**Returns:** A function that creates adapter instances for specific models.

## Next Steps

- [Cencori Dashboard](https://cencori.com) — View analytics, logs, and costs
- [Documentation](https://cencori.com/docs) — Complete API reference
- [GitHub Repository](https://github.com/cencori/cencori) — SDK source code
- [Streaming Guide](../guides/streaming) — Learn about streaming responses
- [Tools Guide](../guides/tools) — Learn about tool calling
