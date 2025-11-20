# OpenAI Adapter

The OpenAI adapter provides access to OpenAI's GPT models, including GPT-4, GPT-3.5, and more.

## Installation

```bash
npm install @tanstack/ai-openai
```

## Basic Usage

```typescript
import { ai } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const aiInstance = ai(openai({
  apiKey: process.env.OPENAI_API_KEY!,
}));
```

## Configuration

```typescript
import { openai, type OpenAIConfig } from "@tanstack/ai-openai";

const config: OpenAIConfig = {
  apiKey: process.env.OPENAI_API_KEY!,
  organization: "org-...", // Optional
  baseURL: "https://api.openai.com/v1", // Optional, for custom endpoints
};

const aiInstance = ai(openai(config));
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
import { ai, toStreamResponse } from "@tanstack/ai";
import { openai } from "@tanstack/ai-openai";

const aiInstance = ai(openai({
  apiKey: process.env.OPENAI_API_KEY!,
}));

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = aiInstance.chat({
    messages,
    model: "gpt-4o",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { tool } from "@tanstack/ai";
import { z } from "zod";

const getWeather = tool({
  description: "Get the current weather",
  inputSchema: z.object({
    location: z.string(),
  }),
  execute: async ({ location }) => {
    // Fetch weather data
    return { temperature: 72, conditions: "sunny" };
  },
});

const stream = aiInstance.chat({
  messages,
  model: "gpt-4o",
  tools: [getWeather],
});
```

## Provider Options

OpenAI supports various provider-specific options:

```typescript
const stream = aiInstance.chat({
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

