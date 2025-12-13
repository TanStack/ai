---
title: Gemini Adapter
id: gemini-adapter
---

The Google Gemini adapter provides access to Google's Gemini models, including text generation, embeddings, image generation with Imagen, and experimental text-to-speech.

## Installation

```bash
npm install @tanstack/ai-gemini
```

## Basic Usage

```typescript
import { ai } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

const adapter = geminiText();

const stream = ai({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "gemini-2.0-flash-exp",
});
```

## Basic Usage - Custom API Key

```typescript
import { ai } from "@tanstack/ai";
import { createGeminiText } from "@tanstack/ai-gemini";

const adapter = createGeminiText(process.env.GEMINI_API_KEY!, {
  // ... your config options
});

const stream = ai({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
  model: "gemini-2.0-flash-exp",
});
```

## Configuration

```typescript
import { createGeminiText, type GeminiTextConfig } from "@tanstack/ai-gemini";

const config: GeminiTextConfig = {
  baseURL: "https://generativelanguage.googleapis.com/v1beta", // Optional
};

const adapter = createGeminiText(process.env.GEMINI_API_KEY!, config);
```

## Available Models

### Chat Models

- `gemini-2.0-flash-exp` - Gemini 2.0 Flash (fast, efficient)
- `gemini-2.0-flash-lite` - Gemini 2.0 Flash Lite (fastest)
- `gemini-2.5-pro` - Gemini 2.5 Pro (most capable)
- `gemini-2.5-flash` - Gemini 2.5 Flash
- `gemini-exp-1206` - Experimental Pro model

### Embedding Models

- `gemini-embedding-001` - Text embedding model
- `text-embedding-004` - Latest embedding model

### Image Generation Models

- `imagen-3.0-generate-002` - Imagen 3.0
- `gemini-2.0-flash-preview-image-generation` - Gemini with image generation

### Text-to-Speech Models (Experimental)

- `gemini-2.5-flash-preview-tts` - Gemini TTS

## Example: Chat Completion

```typescript
import { ai, toStreamResponse } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

const adapter = geminiText();

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = ai({
    adapter,
    messages,
    model: "gemini-2.0-flash-exp",
  });

  return toStreamResponse(stream);
}
```

## Example: With Tools

```typescript
import { ai, toolDefinition } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { z } from "zod";

const adapter = geminiText();

const getCalendarEventsDef = toolDefinition({
  name: "get_calendar_events",
  description: "Get calendar events for a date",
  inputSchema: z.object({
    date: z.string(),
  }),
});

const getCalendarEvents = getCalendarEventsDef.server(async ({ date }) => {
  // Fetch calendar events
  return { events: [] };
});

const stream = ai({
  adapter,
  messages,
  model: "gemini-2.0-flash-exp",
  tools: [getCalendarEvents],
});
```

## Provider Options

Gemini supports various provider-specific options:

```typescript
const stream = ai({
  adapter: geminiText(),
  messages,
  model: "gemini-2.0-flash-exp",
  providerOptions: {
    maxOutputTokens: 2048,
    temperature: 0.7,
    topP: 0.9,
    topK: 40,
    stopSequences: ["END"],
  },
});
```

### Thinking

Enable thinking for models that support it:

```typescript
providerOptions: {
  thinking: {
    includeThoughts: true,
  },
}
```

### Structured Output

Configure structured output format:

```typescript
providerOptions: {
  responseMimeType: "application/json",
}
```

## Embeddings

Generate text embeddings for semantic search and similarity:

```typescript
import { ai } from "@tanstack/ai";
import { geminiEmbed } from "@tanstack/ai-gemini";

const adapter = geminiEmbed();

const result = await ai({
  adapter,
  model: "gemini-embedding-001",
  input: "The quick brown fox jumps over the lazy dog",
});

console.log(result.embeddings);
```

### Batch Embeddings

```typescript
const result = await ai({
  adapter: geminiEmbed(),
  model: "gemini-embedding-001",
  input: [
    "First text to embed",
    "Second text to embed",
    "Third text to embed",
  ],
});
```

### Embedding Provider Options

```typescript
const result = await ai({
  adapter: geminiEmbed(),
  model: "gemini-embedding-001",
  input: "...",
  providerOptions: {
    taskType: "RETRIEVAL_DOCUMENT", // or "RETRIEVAL_QUERY", "SEMANTIC_SIMILARITY", etc.
  },
});
```

## Summarization

Summarize long text content:

```typescript
import { ai } from "@tanstack/ai";
import { geminiSummarize } from "@tanstack/ai-gemini";

const adapter = geminiSummarize();

const result = await ai({
  adapter,
  model: "gemini-2.0-flash-exp",
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Image Generation

Generate images with Imagen:

```typescript
import { ai } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const adapter = geminiImage();

const result = await ai({
  adapter,
  model: "imagen-3.0-generate-002",
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
});

console.log(result.images);
```

### Image Provider Options

```typescript
const result = await ai({
  adapter: geminiImage(),
  model: "imagen-3.0-generate-002",
  prompt: "...",
  providerOptions: {
    aspectRatio: "16:9", // "1:1" | "3:4" | "4:3" | "9:16" | "16:9"
    personGeneration: "DONT_ALLOW", // Control person generation
    safetyFilterLevel: "BLOCK_SOME", // Safety filtering
  },
});
```

## Text-to-Speech (Experimental)

> **Note:** Gemini TTS is experimental and may require the Live API for full functionality.

Generate speech from text:

```typescript
import { ai } from "@tanstack/ai";
import { geminiTTS } from "@tanstack/ai-gemini";

const adapter = geminiTTS();

const result = await ai({
  adapter,
  model: "gemini-2.5-flash-preview-tts",
  text: "Hello from Gemini TTS!",
});

console.log(result.audio); // Base64 encoded audio
```

## Environment Variables

Set your API key in environment variables:

```bash
GEMINI_API_KEY=your-api-key-here
# or
GOOGLE_API_KEY=your-api-key-here
```

## Getting an API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a new API key
3. Add it to your environment variables

## API Reference

### `geminiText(config?)`

Creates a Gemini text/chat adapter using environment variables.

**Returns:** A Gemini text adapter instance.

### `createGeminiText(apiKey, config?)`

Creates a Gemini text/chat adapter with an explicit API key.

**Parameters:**

- `apiKey` - Your Gemini API key
- `config.baseURL?` - Custom base URL (optional)

**Returns:** A Gemini text adapter instance.

### `geminiEmbed(config?)`

Creates a Gemini embedding adapter using environment variables.

**Returns:** A Gemini embed adapter instance.

### `createGeminiEmbed(apiKey, config?)`

Creates a Gemini embedding adapter with an explicit API key.

**Returns:** A Gemini embed adapter instance.

### `geminiSummarize(config?)`

Creates a Gemini summarization adapter using environment variables.

**Returns:** A Gemini summarize adapter instance.

### `createGeminiSummarize(apiKey, config?)`

Creates a Gemini summarization adapter with an explicit API key.

**Returns:** A Gemini summarize adapter instance.

### `geminiImage(config?)`

Creates a Gemini image generation adapter using environment variables.

**Returns:** A Gemini image adapter instance.

### `createGeminiImage(apiKey, config?)`

Creates a Gemini image generation adapter with an explicit API key.

**Returns:** A Gemini image adapter instance.

### `geminiTTS(config?)`

Creates a Gemini TTS adapter using environment variables.

**Returns:** A Gemini TTS adapter instance.

### `createGeminiTTS(apiKey, config?)`

Creates a Gemini TTS adapter with an explicit API key.

**Returns:** A Gemini TTS adapter instance.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../guides/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers
