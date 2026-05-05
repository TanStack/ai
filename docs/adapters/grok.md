---
title: Grok (xAI)
id: grok-adapter
order: 5
description: "Use xAI Grok models with TanStack AI — Grok 4.3, Grok 4.2, image generation, speech, transcription, and xAI server-side tools via @tanstack/ai-grok."
keywords:
  - tanstack ai
  - grok
  - xai
  - grok 4.3
  - grok 4.2
  - responses api
  - server-side tools
  - image generation
  - adapter
---

The Grok adapter provides access to xAI's Grok models through `@tanstack/ai-grok`.
Text generation uses xAI's **Responses API** (`/v1/responses`), including streaming text, reasoning events, structured output, app-defined function tools, and xAI server-side tools.

## Installation

```bash
npm install @tanstack/ai-grok
```

Set your xAI API key:

```bash
XAI_API_KEY=xai-...
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

const stream = chat({
  adapter: grokText("grok-4.3"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createGrokText } from "@tanstack/ai-grok";

const adapter = createGrokText("grok-4.3", process.env.XAI_API_KEY!);

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

const adapter = createGrokText("grok-4.3", process.env.XAI_API_KEY!, config);
```

## Chat Route Example

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: grokText("grok-4.3"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## App-Defined Function Tools

Use `toolDefinition()` for tools that run in your application. The Grok adapter converts these to strict Responses API function tools.

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
  return { location, temperature: 72, conditions: "sunny" };
});

const stream = chat({
  adapter: grokText("grok-4.3"),
  messages: [{ role: "user", content: "What's the weather in Berlin?" }],
  tools: [getWeather],
});
```

## xAI Server-Side Tools

Grok also supports provider-native server-side tools through the `@tanstack/ai-grok/tools` subpath. These tools run on xAI's side rather than in your application process.

```typescript
import { chat } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";
import {
  codeExecutionTool,
  fileSearchTool,
  mcpTool,
  webSearchTool,
  xSearchTool,
} from "@tanstack/ai-grok/tools";

const stream = chat({
  adapter: grokText("grok-4.3"),
  messages: [{ role: "user", content: "Search the web and summarize the latest xAI news." }],
  tools: [webSearchTool()],
});
```

### Web Search

```typescript
import { webSearchTool } from "@tanstack/ai-grok/tools";

const tools = [webSearchTool()];
```

### X Search

```typescript
import { xSearchTool } from "@tanstack/ai-grok/tools";

const tools = [
  xSearchTool({
    allowed_x_handles: ["xai"],
    enable_image_understanding: true,
  }),
];
```

### Code Execution

```typescript
import { codeExecutionTool } from "@tanstack/ai-grok/tools";

const tools = [codeExecutionTool()];
```

### Code Interpreter

```typescript
import { codeInterpreterTool } from "@tanstack/ai-grok/tools";

const tools = [codeInterpreterTool({ type: "auto" })];
```

### File Search

```typescript
import { fileSearchTool } from "@tanstack/ai-grok/tools";

const tools = [
  fileSearchTool({
    type: "file_search",
    vector_store_ids: ["vs_123"],
    max_num_results: 5,
  }),
];
```

### Collections Search

```typescript
import { collectionsSearchTool } from "@tanstack/ai-grok/tools";

const tools = [
  collectionsSearchTool({
    vector_store_ids: ["vs_123"],
  }),
];
```

### MCP

```typescript
import { mcpTool } from "@tanstack/ai-grok/tools";

const tools = [
  mcpTool({
    server_url: "https://example.com/mcp",
    server_label: "example-mcp",
  }),
];
```

Use either `server_url` or `connector_id` for MCP tools, not both.

## Model Options

Common generation controls live on the top-level `chat()` call:

```typescript
const stream = chat({
  adapter: grokText("grok-4.3"),
  messages,
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 1024,
});
```

Responses API-specific options go in `modelOptions`:

```typescript
const stream = chat({
  adapter: grokText("grok-4.3"),
  messages,
  modelOptions: {
    store: false,
    include: ["reasoning.encrypted_content"],
    parallel_tool_calls: true,
  },
});
```

The adapter defaults to `store: false` and `include: ["reasoning.encrypted_content"]` so xAI returns encrypted reasoning blobs when the model emits reasoning. The adapter requests these blobs by default; it does not yet automatically replay encrypted reasoning items on subsequent turns.

Not every xAI model accepts every reasoning sub-option. For example, `grok-4.3` and `grok-4.2` reject `reasoning.effort`, so the adapter fails early if you pass that unsupported option for those models.

## Structured Output

Use `outputSchema` for structured output. The Grok adapter sends this through the Responses API `text.format` JSON Schema configuration.

```typescript
import { chat } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";
import { z } from "zod";

const result = await chat({
  adapter: grokText("grok-4.3"),
  messages: [{ role: "user", content: "Describe Tokyo." }],
  outputSchema: z.object({
    name: z.string(),
    country: z.string(),
    population: z.number(),
  }),
});
```

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { grokSummarize } from "@tanstack/ai-grok";

const result = await summarize({
  adapter: grokSummarize("grok-4.3"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});
```

## Image Generation

```typescript
import { generateImage } from "@tanstack/ai";
import { grokImage } from "@tanstack/ai-grok";

const result = await generateImage({
  adapter: grokImage("grok-imagine-image"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
});
```

## Speech and Transcription

The package also includes xAI TTS and transcription adapters:

```typescript
import { generateSpeech, generateTranscription } from "@tanstack/ai";
import { grokSpeech, grokTranscription } from "@tanstack/ai-grok";
```

## API Reference

### `grokText(model, config?)`

Creates a Grok text adapter using `XAI_API_KEY` from the environment.

### `createGrokText(model, apiKey, config?)`

Creates a Grok text adapter with an explicit API key.

### `grokSummarize(model, config?)` / `createGrokSummarize(model, apiKey, config?)`

Creates a Grok summarization adapter.

### `grokImage(model, config?)` / `createGrokImage(model, apiKey, config?)`

Creates a Grok image adapter.

### `grokSpeech(model, config?)` / `createGrokSpeech(model, apiKey, config?)`

Creates a Grok text-to-speech adapter.

### `grokTranscription(model, config?)` / `createGrokTranscription(model, apiKey, config?)`

Creates a Grok speech-to-text adapter.

## Migrating from 0.7.x (Chat Completions API)

`@tanstack/ai-grok` 0.8+ targets xAI's `/v1/responses` endpoint instead of `/v1/chat/completions`. If you only use `chat()` / `generate()` / `summarize()` / `useChat()`, no changes are required.

If you pass `modelOptions` directly:

| Before (Chat Completions) | After (Responses API) |
| --- | --- |
| `modelOptions: { max_tokens }` | top-level `maxTokens` (mapped to `max_output_tokens`) |
| `modelOptions: { top_p }` | top-level `topP` |
| `modelOptions: { frequency_penalty, presence_penalty, stop }` | not supported on `/v1/responses`; remove |
| `modelOptions: { user }` | unchanged |

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about app-defined tools
- [Provider Tools](../tools/provider-tools.md) - Learn about provider-native tools
- [Other Adapters](./openai) - Explore other providers
