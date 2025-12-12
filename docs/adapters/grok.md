---
title: Grok Adapter
id: grok-adapter
---

The Grok adapter provides access to xAI's Grok models, including Grok 3, Grok 3 Mini, and vision-capable models.

## Installation

```bash
npm install @tanstack/ai-grok
```

## Basic Usage

```typescript
import { ai } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

const adapter = grokText();

const stream = ai({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "grok-3",
});
```

## Basic Usage - Custom API Key

```typescript
import { ai } from "@tanstack/ai";
import { createGrokText } from "@tanstack/ai-grok";

const adapter = createGrokText(process.env.XAI_API_KEY!, {
  // ... your config options
});

const stream = ai({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "grok-3",
});
```

## Configuration

```typescript
import { createGrokText, type GrokTextConfig } from "@tanstack/ai-grok";

const config: GrokTextConfig = {
  baseURL: "https://api.x.ai/v1", // Optional, for custom endpoints
};

const adapter = createGrokText(process.env.XAI_API_KEY!, config);
```

## Available Models

### Chat Models

- `grok-3` - Latest flagship model
- `grok-3-mini` - Smaller, faster model
- `grok-4` - Next generation model
- `grok-4-fast` - Fast inference model
- `grok-4.1-fast` - Production-focused fast model
- `grok-2-vision-1212` - Vision-capable model (text + image input)

### Image Generation Models

- `grok-2-image-1212` - Image generation model

## Example: Chat Completion

```typescript
import { ai, toStreamResponse } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

const adapter = grokText();

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = ai({
    adapter,
    messages,
    model: "grok-3",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { ai, toolDefinition } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";
import { z } from "zod";

const adapter = grokText();

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
  model: "grok-3",
  tools: [getWeather],
});
```

## Provider Options

Grok supports various provider-specific options:

```typescript
const stream = ai({
  adapter: grokText(),
  messages,
  model: "grok-3",
  providerOptions: {
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 1000,
    frequency_penalty: 0.5,
    presence_penalty: 0.5,
    stop: ["END"],
  },
});
```

## Summarization

Grok supports text summarization:

```typescript
import { ai } from "@tanstack/ai";
import { grokSummarize } from "@tanstack/ai-grok";

const adapter = grokSummarize();

const result = await ai({
  adapter,
  model: "grok-3",
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Image Generation

Grok supports image generation with the `grok-2-image-1212` model:

```typescript
import { ai } from "@tanstack/ai";
import { grokImage } from "@tanstack/ai-grok";

const adapter = grokImage();

const result = await ai({
  adapter,
  model: "grok-2-image-1212",
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
  size: "1024x1024", // "1024x1024" | "1536x1024" | "1024x1536"
});

console.log(result.images);
```

### Image Provider Options

```typescript
const result = await ai({
  adapter: grokImage(),
  model: "grok-2-image-1212",
  prompt: "...",
  providerOptions: {
    // Additional provider-specific options
  },
});
```

## Environment Variables

Set your API key in environment variables:

```bash
XAI_API_KEY=xai-...
```

## Getting an API Key

1. Go to the [xAI Console](https://console.x.ai)
2. Create a new API key
3. Add it to your environment variables as `XAI_API_KEY`

## API Reference

### `grokText(config?)`

Creates a Grok text/chat adapter instance using environment variables.

**Returns:** A Grok text adapter instance.

### `createGrokText(apiKey, config?)`

Creates a Grok text/chat adapter instance with an explicit API key.

**Parameters:**

- `apiKey` - Your xAI API key
- `config.baseURL?` - Custom base URL (optional)

**Returns:** A Grok text adapter instance.

### `grokSummarize(config?)`

Creates a Grok summarization adapter using environment variables.

**Returns:** A Grok summarize adapter instance.

### `createGrokSummarize(apiKey, config?)`

Creates a Grok summarization adapter with an explicit API key.

**Parameters:**

- `apiKey` - Your xAI API key
- `config.baseURL?` - Custom base URL (optional)

**Returns:** A Grok summarize adapter instance.

### `grokImage(config?)`

Creates a Grok image generation adapter using environment variables.

**Returns:** A Grok image adapter instance.

### `createGrokImage(apiKey, config?)`

Creates a Grok image generation adapter with an explicit API key.

**Parameters:**

- `apiKey` - Your xAI API key
- `config.baseURL?` - Custom base URL (optional)

**Returns:** A Grok image adapter instance.

## Limitations

- **Embeddings**: Grok does not support embeddings natively. Use OpenAI or Gemini for embedding needs.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers
