---
title: OpenRouter Adapter
id: openrouter-adapter
---

The OpenRouter adapter provides access to 300+ AI models from various providers through a single unified API, including models from OpenAI, Anthropic, Google, Meta, Mistral, and many more.

## Installation

```bash
npm install @tanstack/ai-openrouter
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { openrouter } from "@tanstack/ai-openrouter";

const adapter = openrouter();

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "openai/gpt-4o",
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
import { chat, toStreamResponse } from "@tanstack/ai";
import { openrouter } from "@tanstack/ai-openrouter";

const adapter = openrouter();

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter,
    messages,
    model: "openai/gpt-4o",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openrouter } from "@tanstack/ai-openrouter";
import { z } from "zod";

const adapter = openrouter();

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
  adapter,
  messages,
  model: "openai/gpt-4o",
  tools: [getWeather],
});
```

## Web Search

OpenRouter supports web search through the `plugins` configuration. This enables real-time web search capabilities for any model:

```typescript
const stream = chat({
  adapter,
  messages: [{ role: "user", content: "What's the latest AI news?" }],
  model: "openai/gpt-4o-mini",
  providerOptions: {
    plugins: [
      {
        id: "web",
        engine: "exa", // "native" or "exa"
        max_results: 5, // default: 5
      },
    ],
  },
});
```

Alternatively, use the `:online` model suffix:

```typescript
const stream = chat({
  adapter,
  messages,
  model: "openai/gpt-4o-mini:online",
});
```

## Provider Options

OpenRouter supports extensive provider-specific options:

```typescript
const stream = chat({
  adapter,
  messages,
  model: "openai/gpt-4o",
  providerOptions: {
    temperature: 0.7,
    max_tokens: 1000,
    top_p: 0.9,
    top_k: 40,
    frequency_penalty: 0.5,
    presence_penalty: 0.5,
    repetition_penalty: 1.1,
    seed: 42,
    tool_choice: "auto",
    response_format: { type: "json_object" },
    // Routing options
    models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"], // Fallback models
    route: "fallback",
    // Provider preferences
    provider: {
      order: ["OpenAI", "Anthropic"],
      allow_fallbacks: true,
    },
  },
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
  adapter,
  messages,
  model: "openrouter/auto", // Automatic model selection
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

## API Reference

### `openrouter(config?)`

Creates an OpenRouter adapter with automatic API key detection from `OPENROUTER_API_KEY`.

**Parameters:**

- `config.baseURL?` - Custom base URL (optional)
- `config.httpReferer?` - HTTP Referer header for rankings (optional)
- `config.xTitle?` - X-Title header for rankings (optional)

**Returns:** An OpenRouter adapter instance.

### `createOpenRouter(apiKey, config?)`

Creates an OpenRouter adapter with explicit API key.

**Parameters:**

- `apiKey` - OpenRouter API key (required)
- `config.baseURL?` - Custom base URL (optional)
- `config.httpReferer?` - HTTP Referer header (optional)
- `config.xTitle?` - X-Title header (optional)

**Returns:** An OpenRouter adapter instance.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers

