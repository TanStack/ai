---
title: OpenAI Adapter
id: openai-adapter
---

The OpenAI adapter provides access to OpenAI's GPT models, including GPT-4, GPT-3.5, and more.

## Installation

```bash
npm install @tanstack/ai-openai
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const adapter = openai({
  apiKey: process.env.OPENAI_API_KEY!,
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "gpt-4o",
});
```

## Configuration

```typescript
import { openai, type OpenAIConfig } from "@tanstack/ai-openai";

const config: OpenAIConfig = {
  apiKey: process.env.OPENAI_API_KEY!,
  organization: "org-...", // Optional
  baseURL: "https://api.openai.com/v1", // Optional, for custom endpoints
};

const adapter = openai(config);
```

## Available Models

### Chat Models

- `gpt-4o` - Latest GPT-4 model
- `gpt-4o-mini` - Faster, cheaper GPT-4 variant
- `gpt-4-turbo` - GPT-4 Turbo
- `gpt-4` - GPT-4 base model
- `gpt-3.5-turbo` - GPT-3.5 Turbo
- And many more...

### Image Models

- `dall-e-3` - DALL-E 3 image generation
- `dall-e-2` - DALL-E 2 image generation

### Embedding Models

- `text-embedding-3-large` - Large embedding model
- `text-embedding-3-small` - Small embedding model
- `text-embedding-ada-002` - Ada embedding model

## Example: Chat Completion

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const adapter = openai({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter,
    messages,
    model: "gpt-4o",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";
import { z } from "zod";

const adapter = openai({
  apiKey: process.env.OPENAI_API_KEY!,
});

const getWeatherDef = toolDefinition({
  name: "get_weather",
  description: "Get the current weather",
  inputSchema: z.object({
    location: z.string(),
  }),
});

const getWeather = getWeatherDef.server(async ({ location }) => {
  // Fetch weather data
  return { temperature: 72, conditions: "sunny" };
});

const stream = chat({
  adapter,
  messages,
  model: "gpt-4o",
  tools: [getWeather],
});
```

## Provider Options

OpenAI supports various provider-specific options:

```typescript
const stream = chat({
  adapter: openai({ apiKey: process.env.OPENAI_API_KEY! }),
  messages,
  model: "gpt-4o",
  providerOptions: {
    temperature: 0.7,
    maxTokens: 1000,
    topP: 0.9,
    frequencyPenalty: 0.5,
    presencePenalty: 0.5,
  },
});
```

### Reasoning

Enable reasoning for models that support it (e.g., GPT-5). This allows the model to show its reasoning process, which is streamed as `thinking` chunks:

```typescript
providerOptions: {
  reasoning: {
    effort: "medium", // "minimal" | "low" | "medium" | "high"
  },
}
```

**Supported Models:**

- `gpt-5` - Supports reasoning with configurable effort
- `o3`, `o3-pro`, `o3-mini` - Support reasoning

When reasoning is enabled, the model's reasoning process is streamed separately from the response text and appears as a collapsible thinking section in the UI.

## Environment Variables

Set your API key in environment variables:

```bash
OPENAI_API_KEY=sk-...
```

## API Reference

### `openai(config)`

Creates an OpenAI adapter instance.

**Parameters:**

- `config.apiKey` - OpenAI API key (required)
- `config.organization?` - Organization ID (optional)
- `config.baseURL?` - Custom base URL (optional)

**Returns:** An OpenAI adapter instance.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./anthropic) - Explore other providers
