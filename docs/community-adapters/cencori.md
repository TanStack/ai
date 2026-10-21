---
title: Cencori
id: cencori-adapter
order: 3
description: "Reach 14+ AI providers (OpenAI, Anthropic, Google, xAI, and more) through one Cencori key in TanStack AI, with security filters, request logs, and cost tracking."
keywords:
  - tanstack ai
  - cencori
  - multi-provider
  - observability
  - cost tracking
  - security
  - community adapter
---

Cencori gives you 14+ AI providers (OpenAI, Anthropic, Google, xAI, and more) through one API key. It also adds security filters, request logs, and cost tracking. Cencori maintains this adapter.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @cencori/ai-sdk
vue: @cencori/ai-sdk
solid: @cencori/ai-sdk
svelte: @cencori/ai-sdk
preact: @cencori/ai-sdk
angular: @cencori/ai-sdk
vanilla: @cencori/ai-sdk
octane: @cencori/ai-sdk

<!-- ::end:tabs -->

## 2. Set the API key

1. Go to [Cencori](https://cencori.com).
2. Create an account and make an API key.
3. Put the key in the environment of your server:

```bash
CENCORI_API_KEY=csk_your_api_key_here
```

## 3. Stream a chat

```typescript ignore
// ignore: @cencori/ai-sdk/tanstack is a subpath export; kiira's paths["*"] wildcard maps it
// to a flat directory lookup and does not consult the package.json exports field,
// so the subpath cannot be resolved until kiira.config.ts adds an explicit path entry.
import { chat } from "@tanstack/ai";
import { cencori } from "@cencori/ai-sdk/tanstack";

const adapter = cencori("o1");

for await (const chunk of chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
})) {
  if (chunk.type === "TEXT_MESSAGE_CONTENT") {
    console.log(chunk.delta);
  }
}
```

The answer prints in the terminal. To show the chat in a UI, return the stream from a route and use `useChat`. See [Streaming](../chat/streaming).

## Switch providers

Change the model id to reach another provider. The responses have the same shape for every provider:

```typescript ignore
// ignore: @cencori/ai-sdk/tanstack subpath not resolvable via kiira's paths["*"] wildcard.
import { cencori } from "@cencori/ai-sdk/tanstack";

// OpenAI-compatible
const openaiCompat = cencori("o1");

// Anthropic
const anthropic = cencori("claude-3-5-sonnet");

// Google
const google = cencori("gemini-2.5-flash");

// xAI
const grok = cencori("grok-3");

// DeepSeek
const deepseek = cencori("deepseek-v3.2");
```

## Tools

Tools work the same as with every adapter:

```typescript ignore
// ignore: @cencori/ai-sdk/tanstack subpath not resolvable via kiira's paths["*"] wildcard.
import { chat, toolDefinition } from "@tanstack/ai";
import { cencori } from "@cencori/ai-sdk/tanstack";
import { z } from "zod";

const adapter = cencori("o1");

const getWeatherDef = toolDefinition({
  name: "getWeather",
  description: "Get weather for a location",
  inputSchema: z.object({ location: z.string() }),
});

const getWeather = getWeatherDef.server(async ({ location }) => {
  // Look up the weather for `location`
  return { temperature: 72, conditions: "Sunny" };
});

for await (const chunk of chat({
  adapter,
  messages: [{ role: "user", content: "What's the weather in NYC?" }],
  tools: [getWeather],
})) {
  if (chunk.type === "TOOL_CALL_START") {
    console.log("Tool call:", chunk.toolCallName);
  } else if (chunk.type === "TOOL_CALL_END") {
    console.log("Tool call finished:", chunk.toolCallId);
  }
}
```

See [Tools](../tools/tools).

## What Cencori adds

- **Security:** PII filters, jailbreak detection, and content moderation.
- **Observability:** request logs, latency metrics, and cost tracking.
- **Cost control:** budgets, alerts, and analytics per route.
- **Failover:** automatic retry, and fallback to other providers.

See the [Cencori dashboard](https://cencori.com) and the [Cencori docs](https://cencori.com/docs).

## Models and options

### Models

| Provider | Models |
|----------|--------|
| OpenAI | `gpt-5`, `gpt-4o`, `gpt-4o-mini`, `o3`, `o1` |
| Anthropic | `claude-opus-4`, `claude-sonnet-4`, `claude-3-5-sonnet` |
| Google | `gemini-3-pro`, `gemini-2.5-flash`, `gemini-2.0-flash` |
| xAI | `grok-4`, `grok-3` |
| Mistral | `mistral-large`, `codestral`, `devstral` |
| DeepSeek | `deepseek-v3.2`, `deepseek-reasoner` |
| And more | Groq, Cohere, Perplexity, Together, Qwen, OpenRouter |

> [!NOTE]
> Cencori is an external package, and its catalog changes over time. Compare the ids above with the [current Cencori catalog](https://cencori.com/docs) before you use them.

### `cencori(model)`

Creates an adapter that reads `CENCORI_API_KEY` from the environment.

- `model`: the model id, for example `"gpt-4o"`, `"claude-3-5-sonnet"`, or `"gemini-2.5-flash"`.

### `createCencori(config)`

Creates an adapter factory with your own settings:

```typescript ignore
// ignore: @cencori/ai-sdk/tanstack subpath not resolvable via kiira's paths["*"] wildcard.
import { createCencori } from "@cencori/ai-sdk/tanstack";

const myCencori = createCencori({
  apiKey: process.env.CENCORI_API_KEY!,
  baseUrl: "https://cencori.com", // Optional
});

const adapter = myCencori("o1");
```

- `config.apiKey`: your Cencori API key.
- `config.baseUrl`: optional, a custom base URL.

It returns a function that creates an adapter for a model.

The SDK source is on [GitHub](https://github.com/cencori/cencori).
