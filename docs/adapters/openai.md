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
import ai from "@tanstack/ai";
import { openaiChat } from "@tanstack/ai-openai";

const adapter = openaiChat();

const stream = ai({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "gpt-4o",
});
```

## Basic Usage - Custom API Key

```typescript
import ai from "@tanstack/ai";
import { createOpenAI } from "@tanstack/ai-openai";
const adapter = createOpenAI(process.env.OPENAI_API_KEY!, {
  // ... your config options
 });
const stream = ai({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "gpt-4o",
});
```

## Configuration

```typescript
import { openaiChat, type OpenAIConfig } from "@tanstack/ai-openai";

const config: OpenAIConfig = { 
  organization: "org-...", // Optional
  baseURL: "https://api.openai.com/v1", // Optional, for custom endpoints
};

const adapter = openaiChat(config);
```
 
## Example: Chat Completion

```typescript
import ai, { toStreamResponse } from "@tanstack/ai";
import { openaiChat } from "@tanstack/ai-openai";

const adapter = openaiChat();

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = ai({
    adapter,
    messages,
    model: "gpt-4o",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import ai, { toolDefinition } from "@tanstack/ai";
import { openaiChat } from "@tanstack/ai-openai";
import { z } from "zod";

const adapter = openaiChat();

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

const stream = ai({
  adapter,
  messages,
  model: "gpt-4o",
  tools: [getWeather],
});
```

## Provider Options

OpenAI supports various provider-specific options:

```typescript
const stream = ai({
  adapter: openaiChat(),
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
    effort: "medium", // "none" | "minimal" | "low" | "medium" | "high"
    summary: "detailed", // "auto" | "detailed" (optional)
  },
}
```
 

When reasoning is enabled, the model's reasoning process is streamed separately from the response text and appears as a collapsible thinking section in the UI.

## Environment Variables

Set your API key in environment variables:

```bash
OPENAI_API_KEY=sk-...
```

## API Reference

### `openaiChat(config)`

Creates an OpenAI chat adapter instance.

**Parameters:**
 
- `config.organization?` - Organization ID (optional)
- `config.baseURL?` - Custom base URL (optional)

**Returns:** An OpenAI adapter instance.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./anthropic) - Explore other providers
