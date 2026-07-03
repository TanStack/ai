---
title: Groq
id: groq-adapter
order: 6
description: "Use Groq's fast inference API with TanStack AI for low-latency LLM responses and Whisper transcription — Llama and other open-weight models via @tanstack/ai-groq."
keywords:
  - tanstack ai
  - groq
  - fast inference
  - llama
  - low latency
  - adapter
  - llm
  - whisper
  - transcription
---

The Groq adapter provides access to Groq's fast inference API, featuring the world's fastest LLM inference and Whisper-based audio transcription.

## Installation

```bash
npm install @tanstack/ai-groq
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { groqText } from "@tanstack/ai-groq";

const stream = chat({
  adapter: groqText("llama-3.3-70b-versatile"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createGroqText } from "@tanstack/ai-groq";

const adapter = createGroqText("llama-3.3-70b-versatile", process.env.GROQ_API_KEY!, {
  // ... your config options
});

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import { createGroqText, type GroqTextConfig } from "@tanstack/ai-groq";

const config: Omit<GroqTextConfig, 'apiKey'> = {
  baseURL: "https://api.groq.com/openai/v1", // Optional, for custom endpoints
};

const adapter = createGroqText("llama-3.3-70b-versatile", process.env.GROQ_API_KEY!, config);
```

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { groqText } from "@tanstack/ai-groq";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: groqText("llama-3.3-70b-versatile"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition, type ModelMessage } from "@tanstack/ai";
import { groqText } from "@tanstack/ai-groq";
import { z } from "zod";

const searchDatabaseDef = toolDefinition({
  name: "search_database",
  description: "Search the database",
  inputSchema: z.object({
    query: z.string(),
  }),
});

const searchDatabase = searchDatabaseDef.server(async ({ query }) => {
  // Search database
  return { results: [] };
});

const messages: Array<ModelMessage> = [{ role: "user", content: "Search for something" }];

const stream = chat({
  adapter: groqText("llama-3.3-70b-versatile"),
  messages,
  tools: [searchDatabase],
});
```

## Transcription

Groq exposes Whisper-based speech-to-text via `groqTranscription()` and the `generateTranscription()` activity. The `audio` input accepts a `File`, `Blob`, `ArrayBuffer`, base64 string, data URL, or an `https://` URL (forwarded directly to Groq without re-uploading).

```typescript
import { generateTranscription } from "@tanstack/ai";
import { groqTranscription } from "@tanstack/ai-groq";

const result = await generateTranscription({
  adapter: groqTranscription("whisper-large-v3-turbo"),
  audio: "https://example.com/recording.mp3",
  language: "en",
});

console.log(result.text);

// verbose_json (the default) populates language, duration, and timestamped segments
for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s → ${segment.end}s] ${segment.text}`);
}
```

Supported models: `whisper-large-v3-turbo`, `whisper-large-v3`. Supported `responseFormat` values: `json`, `text`, `verbose_json` (default). `srt` and `vtt` are not supported by Groq.

See [Transcription](../media/transcription) for the full API.

## Model Options

Groq supports various provider-specific options. Sampling parameters live here too — `temperature`, `top_p`, and `max_completion_tokens` (Groq's token-limit key) — rather than as root-level props on `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { groqText } from "@tanstack/ai-groq";

const stream = chat({
  adapter: groqText("llama-3.3-70b-versatile"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    temperature: 0.7,
    max_completion_tokens: 1024,
    top_p: 0.9,
  },
});
```

> If you previously passed `temperature` / `topP` / `maxTokens` at the root of `chat()`, see [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

## Summarization

Summarize long text content:

```typescript
import { summarize } from "@tanstack/ai";
import { groqSummarize } from "@tanstack/ai-groq";

const result = await summarize({
  adapter: groqSummarize("llama-3.3-70b-versatile"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

### Reasoning

Enable reasoning for models that support it (e.g., `openai/gpt-oss-120b`, `qwen/qwen3-32b`). This allows the model to show its reasoning process, which is streamed as `thinking` chunks:

```typescript ignore
modelOptions: {
  reasoning_effort: "medium", // "none" | "default" | "low" | "medium" | "high"
}
```

## Supported Models

Groq offers a diverse selection of models from multiple providers:

### Meta Llama

- `llama-3.3-70b-versatile` - Fast, capable model with 128K context
- `llama-3.1-8b-instant` - Fast, cost-effective model
- `meta-llama/llama-4-maverick-17b-128e-instruct` - Latest Llama 4 with vision support
- `meta-llama/llama-4-scout-17b-16e-instruct` - Efficient Llama 4 model

### Security Models

- `meta-llama/llama-guard-4-12b` - Content moderation
- `meta-llama/llama-prompt-guard-2-86m` - Prompt injection detection
- `meta-llama/llama-prompt-guard-2-22m` - Lightweight prompt guard

### OpenAI GPT-OSS Models

- `openai/gpt-oss-120b` - Large OSS model with reasoning support
- `openai/gpt-oss-20b` - Efficient OSS model
- `openai/gpt-oss-safeguard-20b` - Safety-tuned OSS model

### Other Providers

- `moonshotai/kimi-k2-instruct-0905` - Kimi K2 with 256K context
- `qwen/qwen3-32b` - Qwen 3 with reasoning support

## Environment Variables

Set your API key in environment variables:

```bash
GROQ_API_KEY=gsk_...
```

## API Reference

### `groqText(model, config?)`

Creates a Groq chat adapter using environment variables.

**Parameters:**

- `model` - The model name (e.g., `llama-3.3-70b-versatile`)
- `config` (optional) - Optional configuration object. Supports the same options as `createGroqText` except `apiKey`, which is auto-detected from `GROQ_API_KEY` environment variable. Common options:
  - `baseURL` - Custom base URL for API requests (optional)

**Returns:** A Groq chat adapter instance.

### `createGroqText(model, apiKey, config?)`

Creates a Groq chat adapter with an explicit API key.

**Parameters:**

- `model` - The model name (e.g., `llama-3.3-70b-versatile`)
- `apiKey` - Your Groq API key
- `config` (optional) - Optional configuration object:
  - `baseURL` - Custom base URL for API requests (optional)

**Returns:** A Groq chat adapter instance.


### `groqSummarize(model, config?)`

Creates a Groq summarization adapter using environment variables.

**Returns:** A Groq summarize adapter instance.

### `createGroqSummarize(model, apiKey, config?)`

Creates a Groq summarization adapter with an explicit API key.

**Returns:** A Groq summarize adapter instance.

### `groqTranscription(model, config?)` / `createGroqTranscription(model, apiKey, config?)`

Creates a Groq transcription (speech-to-text) adapter. The short form reads `GROQ_API_KEY` from the environment; the `create*` form takes an explicit API key. Supported models: `whisper-large-v3-turbo`, `whisper-large-v3`.


## Limitations

- **Text-to-Speech**: Groq does not currently expose a TTS adapter. Use OpenAI, Gemini, ElevenLabs, or fal for speech generation.
- **Image Generation**: Groq does not support image generation. Use OpenAI, Gemini, or fal for image generation.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers

## Provider Tools

Groq does not currently expose provider-specific tool factories.
Define your own tools with `toolDefinition()` from `@tanstack/ai`.

See [Tools](../tools/tools.md) for the general tool-definition flow, or
[Provider Tools](../tools/provider-tools.md) for other providers'
native-tool offerings.
