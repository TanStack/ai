---
title: Groq
id: groq-adapter
order: 6
---

The Groq adapter provides access to Groq's fast inference API, featuring the world's fastest LLM inference.

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
  adapter: adapter,
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
import { chat, toolDefinition } from "@tanstack/ai";
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

const messages = [{ role: "user", content: "Search for something" }];

const stream = chat({
  adapter: groqText("llama-3.3-70b-versatile"),
  messages,
  tools: [searchDatabase],
});
```

## Model Options

Groq supports various provider-specific options:

```typescript
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

### Reasoning

Enable reasoning for models that support it (e.g., `openai/gpt-oss-120b`, `qwen/qwen3-32b`). This allows the model to show its reasoning process, which is streamed as `thinking` chunks:

```typescript
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

## Text-to-Speech

Groq provides unique Text-to-Speech capabilities via Canopy Labs Orpheus models:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { groqSpeech } from "@tanstack/ai-groq";

const result = await generateSpeech({
  adapter: groqSpeech("canopylabs/orpheus-v1-english"),
  text: "Hello, welcome to TanStack AI!",
  voice: "autumn",
  format: "wav",
});

// result.audio contains base64-encoded audio
console.log(result.format); // "wav"
```

### English Voices

Available voices: `autumn`, `diana`, `hannah`, `austin`, `daniel`, `troy`

### Arabic Voices

Available voices for Arabic model (`canopylabs/orpheus-arabic-saudi`): `fahad`, `sultan`, `lulwa`, `noura`

### TTS Model Options

```typescript
const result = await generateSpeech({
  adapter: groqSpeech("canopylabs/orpheus-v1-english"),
  text: "High quality speech",
  voice: "diana",
  format: "wav",
  modelOptions: {
    sample_rate: 24000, // Audio sample rate in Hz
  },
});
```

### Supported TTS Formats

- `wav` (only format currently supported for Orpheus models)
- `mp3`
- `flac`
- `ogg`
- `mulaw`

> **Note:** Additional formats (`mp3`, `flac`, `ogg`, `mulaw`) are defined for future compatibility but are not yet supported by Orpheus TTS models.

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

### `groqSpeech(model, config?)`

Creates a Groq TTS adapter using environment variables.

**Parameters:**

- `model` - The TTS model name (e.g., `canopylabs/orpheus-v1-english`)

**Returns:** A Groq speech adapter instance.

### `createGroqSpeech(model, apiKey, config?)`

Creates a Groq TTS adapter with an explicit API key.

**Parameters:**

- `model` - The TTS model name (e.g., `canopylabs/orpheus-v1-english`)
- `apiKey` - Your Groq API key
- `config.baseURL?` - Custom base URL (optional)

**Returns:** A Groq speech adapter instance.

## Limitations

- **Image Generation**: Groq does not support image generation. Use OpenAI or Gemini for image generation.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers
