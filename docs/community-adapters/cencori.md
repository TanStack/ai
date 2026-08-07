---
title: Cencori
id: cencori-adapter
order: 3
description: "Multi-provider chat via Cencori (security, observability, cost tracking) for TanStack AI."
keywords:
  - tanstack ai
  - cencori
  - multi-provider
  - observability
  - cost tracking
  - security
  - community adapter
---

# Cencori

If you want one key across many providers with Cencori security/observability → install the adapter and pass a model id.

## Install

```bash
npm install @cencori/ai-sdk
```

```bash
CENCORI_API_KEY=csk_your_api_key_here
```

API key: [cencori.com](https://cencori.com).

## Usage

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

## Config

```typescript ignore
// ignore: @cencori/ai-sdk/tanstack subpath not resolvable via kiira's paths["*"] wildcard.
import { createCencori } from "@cencori/ai-sdk/tanstack";

const myCencori = createCencori({
  apiKey: process.env.CENCORI_API_KEY!,
  baseUrl: "https://cencori.com", // optional
});

const adapter = myCencori("o1");
```

## Tools

```typescript ignore
// ignore: @cencori/ai-sdk/tanstack subpath not resolvable via kiira's paths["*"] wildcard.
import { chat, toolDefinition } from "@tanstack/ai";
import { cencori } from "@cencori/ai-sdk/tanstack";
import { z } from "zod";

const getWeather = toolDefinition({
  name: "getWeather",
  description: "Get weather for a location",
  inputSchema: z.object({ location: z.string() }),
}).server(async ({ location }) => {
  return { temperature: 72, conditions: "Sunny" };
});

for await (const chunk of chat({
  adapter: cencori("o1"),
  messages: [{ role: "user", content: "What's the weather in NYC?" }],
  tools: [getWeather],
})) {
  if (chunk.type === "TOOL_CALL_START") {
    console.log("Tool call:", chunk.toolCallName);
  }
}
```

## Models

Switch provider by model id:

```typescript ignore
// ignore: @cencori/ai-sdk/tanstack subpath not resolvable via kiira's paths["*"] wildcard.
import { cencori } from "@cencori/ai-sdk/tanstack";

cencori("o1");
cencori("claude-3-5-sonnet");
cencori("gemini-2.5-flash");
cencori("grok-3");
cencori("deepseek-v3.2");
```

| Provider | Models (verify against Cencori catalogue) |
|----------|--------|
| OpenAI | `gpt-5`, `gpt-4o`, `gpt-4o-mini`, `o3`, `o1` |
| Anthropic | `claude-opus-4`, `claude-sonnet-4`, `claude-3-5-sonnet` |
| Google | `gemini-3-pro`, `gemini-2.5-flash`, `gemini-2.0-flash` |
| xAI / DeepSeek / others | `grok-4`, `deepseek-v3.2`, plus Groq, Cohere, Perplexity, Together, Qwen, OpenRouter |

Confirm ids at [Cencori docs](https://cencori.com/docs).

## API

- `cencori(model)` — env-based adapter
- `createCencori({ apiKey, baseUrl? })` — factory returning model → adapter

## Links

- [Dashboard](https://cencori.com) · [Docs](https://cencori.com/docs) · [GitHub](https://github.com/cencori/cencori)
- TanStack: [Streaming](../chat/streaming) · [Tools](../tools/tools)
