---
title: Grok (xAI)
id: grok-adapter
order: 5
---

The Grok adapter provides access to xAI's Grok models, including Grok 4.1, Grok 4, Grok 3, and image generation with Grok 2 Image.

## Installation

```bash
npm install @tanstack/ai-grok
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

const stream = chat({
  adapter: grokText("grok-4"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createGrokText } from "@tanstack/ai-grok";

const adapter = createGrokText("grok-4", process.env.XAI_API_KEY!);

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import { createGrokText, type GrokTextConfig } from "@tanstack/ai-grok";

const config: Omit<GrokTextConfig, "apiKey"> = {
  baseURL: "https://api.x.ai/v1", // Optional, this is the default
};

const adapter = createGrokText("grok-4", process.env.XAI_API_KEY!, config);
```

## Example: Chat Completion

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: grokText("grok-4"),
    messages,
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";
import { z } from "zod";

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
  adapter: grokText("grok-4-1-fast-reasoning"),
  messages,
  tools: [getWeather],
});
```

## Model Options

Grok supports various provider-specific options:

```typescript
const stream = chat({
  adapter: grokText("grok-4"),
  messages,
  modelOptions: {
    frequency_penalty: 0.5,
    presence_penalty: 0.5,
    stop: ["END"],
  },
});
```

## Summarization

Summarize long text content:

```typescript
import { summarize } from "@tanstack/ai";
import { grokSummarize } from "@tanstack/ai-grok";

const result = await summarize({
  adapter: grokSummarize("grok-4"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Image Generation

Generate images with Grok 2 Image:

```typescript
import { generateImage } from "@tanstack/ai";
import { grokImage } from "@tanstack/ai-grok";

const result = await generateImage({
  adapter: grokImage("grok-2-image-1212"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
});

console.log(result.images);
```

## Environment Variables

Set your API key in environment variables:

```bash
XAI_API_KEY=xai-...
```

## Implementation Notes

### Why Chat Completions API (Not Responses API)

The Grok adapter uses xAI's **Chat Completions API** (`/v1/chat/completions`) rather than the Responses API (`/v1/responses`). This is an intentional architectural decision:

1. **User-Defined Tools**: The Chat Completions API supports user-defined function tools, which is essential for TanStack AI's tool calling functionality. The Responses API only supports xAI's server-side tools (web search, X search, code execution).

2. **Full Tool Calling Support**: With Chat Completions, you can define custom tools with Zod schemas that run in your application. The Responses API restricts you to xAI's built-in tools only.

3. **Streaming Compatibility**: The streaming event format differs significantly between the two APIs. Chat Completions uses `delta.tool_calls` with argument accumulation, while Responses API uses `response.output_item.added` and `response.function_call_arguments.done`.

4. **OpenAI SDK Compatibility**: xAI's Chat Completions API is fully compatible with the OpenAI SDK, making integration straightforward while maintaining full feature parity for tool calling.

If you need xAI's server-side tools (web search, X/Twitter search, code execution), you would need to use the Responses API directly. However, for most use cases requiring custom tool definitions, the Chat Completions API is the correct choice.

## API Reference

### `grokText(model, config?)`

Creates a Grok text adapter using environment variables.

**Parameters:**

- `model` - The model name (e.g., `'grok-4'`, `'grok-4-1-fast-reasoning'`)
- `config.baseURL?` - Custom base URL (optional)

**Returns:** A Grok text adapter instance.

### `createGrokText(model, apiKey, config?)`

Creates a Grok text adapter with an explicit API key.

**Parameters:**

- `model` - The model name
- `apiKey` - Your xAI API key
- `config.baseURL?` - Custom base URL (optional)

**Returns:** A Grok text adapter instance.

### `grokSummarize(model, config?)`

Creates a Grok summarization adapter using environment variables.

**Returns:** A Grok summarize adapter instance.

### `createGrokSummarize(model, apiKey, config?)`

Creates a Grok summarization adapter with an explicit API key.

**Returns:** A Grok summarize adapter instance.

### `grokImage(model, config?)`

Creates a Grok image generation adapter using environment variables.

**Returns:** A Grok image adapter instance.

### `createGrokImage(model, apiKey, config?)`

Creates a Grok image generation adapter with an explicit API key.

**Returns:** A Grok image adapter instance.

## Limitations

- **Text-to-Speech**: Grok does not support text-to-speech. Use OpenAI for TTS.
- **Transcription**: Grok does not support audio transcription. Use OpenAI's Whisper.
- **Responses API Tools**: Server-side tools (web search, X search, code execution) are not supported through this adapter. Use the Chat Completions API with custom tools instead.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers
