---
title: OpenAI Adapter
id: openai-adapter
---

The OpenAI adapter provides access to OpenAI's models, including GPT-4o, GPT-5, embeddings, image generation (DALL-E), text-to-speech (TTS), and audio transcription (Whisper).

## Installation

```bash
npm install @tanstack/ai-openai
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { openaiChat } from "@tanstack/ai-openai";

const adapter = openaiChat();

const stream = chat({
  adapter,
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";

const adapter = createOpenaiChat(process.env.OPENAI_API_KEY!, {
  // ... your config options
});

const stream = chat({
  adapter,
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import { createOpenaiChat, type OpenAIChatConfig } from "@tanstack/ai-openai";

const config: Omit<OpenAIChatConfig, 'apiKey'> = {
  organization: "org-...", // Optional
  baseURL: "https://api.openai.com/v1", // Optional, for custom endpoints
};

const adapter = createOpenaiChat(process.env.OPENAI_API_KEY!, config);
```

## Available Models

### Chat Models

- `gpt-4o` - GPT-4o (recommended)
- `gpt-4o-mini` - GPT-4o Mini (faster, cheaper)
- `gpt-5` - GPT-5 (with reasoning support)
- `o3` - O3 reasoning model
- `o3-mini` - O3 Mini

### Embedding Models

- `text-embedding-3-small` - Small embedding model
- `text-embedding-3-large` - Large embedding model
- `text-embedding-ada-002` - Legacy embedding model

### Image Models

- `gpt-image-1` - Latest image generation model
- `dall-e-3` - DALL-E 3

### Text-to-Speech Models

- `tts-1` - Standard TTS (fast)
- `tts-1-hd` - High-definition TTS
- `gpt-4o-audio-preview` - GPT-4o with audio output

### Transcription Models

- `whisper-1` - Whisper large-v2
- `gpt-4o-transcribe` - GPT-4o transcription
- `gpt-4o-mini-transcribe` - GPT-4o Mini transcription

## Example: Chat Completion

```typescript
import { chat, toStreamResponse } from "@tanstack/ai";
import { openaiChat } from "@tanstack/ai-openai";

const adapter = openaiChat();

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter,
    model: "gpt-4o",
    messages,
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
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

const stream = chat({
  adapter,
  model: "gpt-4o",
  messages,
  tools: [getWeather],
});
```

## Provider Options

OpenAI supports various provider-specific options:

```typescript
const stream = chat({
  adapter: openaiChat(),
  model: "gpt-4o",
  messages,
  modelOptions: {
    temperature: 0.7,
    max_tokens: 1000,
    top_p: 0.9,
    frequency_penalty: 0.5,
    presence_penalty: 0.5,
    stop: ["END"],
  },
});
```

### Reasoning

Enable reasoning for models that support it (e.g., GPT-5, O3). This allows the model to show its reasoning process, which is streamed as `thinking` chunks:

```typescript
modelOptions: {
  reasoning: {
    effort: "medium", // "none" | "minimal" | "low" | "medium" | "high"
    summary: "detailed", // "auto" | "detailed" (optional)
  },
}
```

When reasoning is enabled, the model's reasoning process is streamed separately from the response text and appears as a collapsible thinking section in the UI.

## Embeddings

Generate text embeddings for semantic search and similarity:

```typescript
import { embedding } from "@tanstack/ai";
import { openaiEmbedding } from "@tanstack/ai-openai";

const adapter = openaiEmbedding();

const result = await embedding({
  adapter,
  model: "text-embedding-3-small",
  input: "The quick brown fox jumps over the lazy dog",
});

console.log(result.embeddings); // Array of embedding vectors
```

### Batch Embeddings

```typescript
const result = await embedding({
  adapter: openaiEmbedding(),
  model: "text-embedding-3-small",
  input: [
    "First text to embed",
    "Second text to embed",
    "Third text to embed",
  ],
});

// result.embeddings contains an array of vectors
```

### Embedding Provider Options

```typescript
const result = await embedding({
  adapter: openaiEmbedding(),
  model: "text-embedding-3-small",
  input: "...",
  modelOptions: {
    dimensions: 512, // Reduce dimensions for smaller storage
  },
});
```

## Summarization

Summarize long text content:

```typescript
import { summarize } from "@tanstack/ai";
import { openaiSummarize } from "@tanstack/ai-openai";

const adapter = openaiSummarize();

const result = await summarize({
  adapter,
  model: "gpt-4o-mini",
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Image Generation

Generate images with DALL-E:

```typescript
import { generateImage } from "@tanstack/ai";
import { openaiImage } from "@tanstack/ai-openai";

const adapter = openaiImage();

const result = await generateImage({
  adapter,
  model: "gpt-image-1",
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
  size: "1024x1024",
});

console.log(result.images);
```

### Image Provider Options

```typescript
const result = await generateImage({
  adapter: openaiImage(),
  model: "gpt-image-1",
  prompt: "...",
  modelOptions: {
    quality: "hd", // "standard" | "hd"
    style: "natural", // "natural" | "vivid"
  },
});
```

## Text-to-Speech

Generate speech from text:

```typescript
import { ai } from "@tanstack/ai";
import { openaiTTS } from "@tanstack/ai-openai";

const adapter = openaiTTS();

const result = await generateSpeech({
  adapter,
  model: "tts-1",
  text: "Hello, welcome to TanStack AI!",
  voice: "alloy",
  format: "mp3",
});

// result.audio contains base64-encoded audio
console.log(result.format); // "mp3"
```

### TTS Voices

Available voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`, `ash`, `ballad`, `coral`, `sage`, `verse`

### TTS Provider Options

```typescript
const result = await generateSpeech({
  adapter: openaiSpeech(),
  model: "tts-1-hd",
  text: "High quality speech",
  modelOptions: {
    speed: 1.0, // 0.25 to 4.0
  },
});
```

## Transcription

Transcribe audio to text:

```typescript
import { ai } from "@tanstack/ai";
import { openaiTranscription } from "@tanstack/ai-openai";

const adapter = openaiTranscription();

const result = await generateTranscription({
  adapter,
  model: "whisper-1",
  audio: audioFile, // File object or base64 string
  language: "en",
});

console.log(result.text); // Transcribed text
```

### Transcription Provider Options

```typescript
const result = await generateTranscription({
  adapter: openaiTranscription(),
  model: "whisper-1",
  audio: audioFile,
  modelOptions: {
    response_format: "verbose_json", // Get timestamps
    temperature: 0,
    prompt: "Technical terms: API, SDK",
  },
});

// Access segments with timestamps
console.log(result.segments);
```

## Environment Variables

Set your API key in environment variables:

```bash
OPENAI_API_KEY=sk-...
```

## API Reference

### `openaiChat(config?)`

Creates an OpenAI chat adapter using environment variables.

**Returns:** An OpenAI chat adapter instance.

### `createOpenaiChat(apiKey, config?)`

Creates an OpenAI chat adapter with an explicit API key.

**Parameters:**

- `apiKey` - Your OpenAI API key
- `config.organization?` - Organization ID (optional)
- `config.baseURL?` - Custom base URL (optional)

**Returns:** An OpenAI chat adapter instance.

### `openaiEmbedding(config?)`

Creates an OpenAI embedding adapter using environment variables.

**Returns:** An OpenAI embedding adapter instance.

### `createOpenaiEmbedding(apiKey, config?)`

Creates an OpenAI embedding adapter with an explicit API key.

**Returns:** An OpenAI embed adapter instance.

### `openaiSummarize(config?)`

Creates an OpenAI summarization adapter using environment variables.

**Returns:** An OpenAI summarize adapter instance.

### `createOpenaiSummarize(apiKey, config?)`

Creates an OpenAI summarization adapter with an explicit API key.

**Returns:** An OpenAI summarize adapter instance.

### `openaiImage(config?)`

Creates an OpenAI image generation adapter using environment variables.

**Returns:** An OpenAI image adapter instance.

### `createOpenaiImage(apiKey, config?)`

Creates an OpenAI image generation adapter with an explicit API key.

**Returns:** An OpenAI image adapter instance.

### `openaiTTS(config?)`

Creates an OpenAI TTS adapter using environment variables.

**Returns:** An OpenAI TTS adapter instance.

### `createOpenaiTTS(apiKey, config?)`

Creates an OpenAI TTS adapter with an explicit API key.

**Returns:** An OpenAI TTS adapter instance.

### `openaiTranscription(config?)`

Creates an OpenAI transcription adapter using environment variables.

**Returns:** An OpenAI transcription adapter instance.

### `createOpenaiTranscription(apiKey, config?)`

Creates an OpenAI transcription adapter with an explicit API key.

**Returns:** An OpenAI transcription adapter instance.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./anthropic) - Explore other providers
