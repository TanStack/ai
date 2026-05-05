---
title: OpenRouter Adapter
id: openrouter-adapter
description: "Access 300+ LLMs from OpenAI, Anthropic, Google, Meta, Mistral, and more through a single API with OpenRouter in TanStack AI."
keywords:
  - tanstack ai
  - openrouter
  - multi-provider
  - unified api
  - llm gateway
  - 300 models
  - adapter
---

OpenRouter is TanStack AI's first official AI partner and the recommended starting point for most projects. It provides access to 300+ models from OpenAI, Anthropic, Google, Meta, Mistral, and many more — all through a single API key and unified interface.

## Installation

```bash
npm install @tanstack/ai-openrouter
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
 
const stream = chat({
  adapter: openRouterText("openai/gpt-5"),
  messages: [{ role: "user", content: "Hello!" }], 
});
```

## Configuration

```typescript
import { createOpenRouter, type OpenRouterConfig } from "@tanstack/ai-openrouter";

const config: OpenRouterConfig = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: "https://openrouter.ai/api/v1", // Optional
  httpReferer: "https://your-app.com", // Optional, for rankings
  xTitle: "Your App Name", // Optional, for rankings
};

const adapter = createOpenRouter(config.apiKey, config);
```

## Available Models

OpenRouter provides access to 300+ models from various providers. Models use the format `provider/model-name`:

```typescript
model: "openai/gpt-5.1"
model: "anthropic/claude-sonnet-4.5"
model: "google/gemini-3-pro-preview"
model: "meta-llama/llama-4-maverick"
model: "deepseek/deepseek-v3.2"
```

See the full list at [openrouter.ai/models](https://openrouter.ai/models).

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
 
export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: openRouterText("openai/gpt-5"),
    messages, 
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { z } from "zod"; 

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({
    location: z.string(),
  }),
});

const getWeather = getWeatherDef.server(async ({ location }) => {
  return { temperature: 72, conditions: "sunny" };
});

const stream = chat({
  adapter: openRouterText("openai/gpt-5"),
  messages, 
  tools: [getWeather],
});
```
 
 

## Environment Variables

Set your API key in environment variables:

```bash
OPENROUTER_API_KEY=sk-or-...
```

## Model Routing

OpenRouter can automatically route requests to the best available provider:

```typescript
const stream = chat({
  adapter: openRouterText("openrouter/auto"),
  messages, 
  providerOptions: {
    models: [
      "openai/gpt-4o",
      "anthropic/claude-3.5-sonnet",
      "google/gemini-pro",
    ],
    route: "fallback", // Use fallback if primary fails
  },
});
```
 
## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about tools

## Provider Tools

> **Migrated from `createWebSearchTool`?** This factory was renamed to
> `webSearchTool` and moved to the `/tools` subpath in this release.
> See [Migration Guide §6](../migration/migration.md#6-provider-tools-moved-to-tools-subpath)
> for the exact before/after.

OpenRouter's gateway exposes web search via a plugin that works across
any proxied chat model. Import it from `@tanstack/ai-openrouter/tools`.

> For the full concept, a comparison matrix, and type-gating details, see
> [Provider Tools](../tools/provider-tools.md).

### `webSearchTool`

Adds web search capability to any OpenRouter-proxied chat model. Choose the
search `engine` (`native` or `exa`), cap results with `maxResults`, and
optionally provide a `searchPrompt` to guide query formation.

```typescript
import { chat } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { webSearchTool } from "@tanstack/ai-openrouter/tools";

const stream = chat({
  adapter: openRouterText("openai/gpt-5"),
  messages: [{ role: "user", content: "What's new in AI this week?" }],
  tools: [
    webSearchTool({
      engine: "exa",
      maxResults: 5,
      searchPrompt: "Recent AI news and research papers",
    }),
  ],
});
```

**Supported models:** all OpenRouter chat models. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

