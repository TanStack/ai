---
title: Google Gemini
id: gemini-adapter
order: 3
description: "Use Google Gemini with TanStack AI — text, image generation via Imagen and Gemini native (NanoBanana), and experimental TTS via @tanstack/ai-gemini."
keywords:
  - tanstack ai
  - gemini
  - google gemini
  - imagen
  - nano banana
  - image generation
  - adapter
  - google ai
---

The Google Gemini adapter provides access to Google's Gemini models, including text generation, image generation with both Imagen and Gemini native image models (NanoBanana), and experimental text-to-speech.

For a full working example with image generation, see the [media generation example app](https://github.com/TanStack/ai/tree/main/examples/ts-react-media).

## Installation

```bash
npm install @tanstack/ai-gemini
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createGeminiChat } from "@tanstack/ai-gemini";

const adapter = createGeminiChat(process.env.GEMINI_API_KEY!, {
  // ... your config options
});

const stream = chat({
  adapter: adapter("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Configuration

```typescript
import { createGeminiChat, type GeminiChatConfig } from "@tanstack/ai-gemini";

const config: Omit<GeminiChatConfig, 'apiKey'> = {
  baseURL: "https://generativelanguage.googleapis.com/v1beta", // Optional
};

const adapter = createGeminiChat(process.env.GEMINI_API_KEY!, config);
```
  

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: geminiText("gemini-2.5-pro"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toolDefinition } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { z } from "zod";

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

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages,
  tools: [getCalendarEvents],
});
```

## Model Options

Gemini supports various model-specific options:

```typescript
const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages,
  modelOptions: {
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
modelOptions: {
  thinking: {
    includeThoughts: true,
  },
}
```

### Structured Output

Configure structured output format:

```typescript
modelOptions: {
  responseMimeType: "application/json",
}
```

## Summarization

Summarize long text content:

```typescript
import { summarize } from "@tanstack/ai";
import { geminiSummarize } from "@tanstack/ai-gemini";

const result = await summarize({
  adapter: geminiSummarize("gemini-2.5-pro"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Image Generation

The Gemini adapter supports two types of image generation:

- **Gemini native image models** (NanoBanana) — Use the `generateContent` API with models like `gemini-3.1-flash-image-preview`. These support extended resolution tiers (1K, 2K, 4K) and aspect ratio control.
- **Imagen models** — Use the `generateImages` API with models like `imagen-4.0-generate-001`. These are dedicated image generation models with WIDTHxHEIGHT sizing.

The adapter automatically routes to the correct API based on the model name — models starting with `gemini-` use `generateContent`, while `imagen-` models use `generateImages`.

### Example: Gemini Native Image Generation (NanoBanana)

From the [media generation example app](https://github.com/TanStack/ai/tree/main/examples/ts-react-media):

```typescript
import { generateImage } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const result = await generateImage({
  adapter: geminiImage("gemini-3.1-flash-image-preview"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
  size: "16:9_4K",
});

console.log(result.images);
```

### Example: Imagen

```typescript
import { generateImage } from "@tanstack/ai";
import { geminiImage } from "@tanstack/ai-gemini";

const result = await generateImage({
  adapter: geminiImage("imagen-4.0-generate-001"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
});

console.log(result.images);
```

### Image Size Options

#### Gemini Native Models (NanoBanana)

Gemini native image models use a template literal size format combining aspect ratio and resolution tier:

```typescript
// Format: "aspectRatio_resolution"
size: "16:9_4K"
size: "1:1_2K"
size: "9:16_1K"
```

| Component | Values |
|-----------|--------|
| Aspect Ratio | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `9:16`, `16:9`, `21:9` |
| Resolution | `1K`, `2K`, `4K` |

#### Imagen Models

Imagen models use WIDTHxHEIGHT format, which maps to aspect ratios internally:

| Size | Aspect Ratio |
|------|-------------|
| `1024x1024` | 1:1 |
| `1920x1080` | 16:9 |
| `1080x1920` | 9:16 |

Alternatively, you can specify the aspect ratio directly in Model Options:

```typescript
const result = await generateImage({
  adapter: geminiImage("imagen-4.0-generate-001"),
  prompt: "A landscape photo",
  modelOptions: {
    aspectRatio: "16:9",
  },
});
```

### Image Model Options

```typescript
const result = await generateImage({
  adapter: geminiImage("imagen-4.0-generate-001"),
  prompt: "...",
  modelOptions: {
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
import { generateSpeech } from "@tanstack/ai";
import { geminiSpeech } from "@tanstack/ai-gemini";

const result = await generateSpeech({
  adapter: geminiSpeech("gemini-2.5-flash-preview-tts"),
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

## Popular Image Models

### Gemini Native Image Models (NanoBanana)

These models use the `generateContent` API and support resolution tiers (1K, 2K, 4K).

| Model | Description |
|-------|-------------|
| `gemini-3.1-flash-image-preview` | Latest and fastest Gemini native image generation |
| `gemini-3-pro-image-preview` | Higher quality Gemini native image generation |
| `gemini-2.5-flash-image` | Gemini 2.5 Flash with image generation |
| `gemini-2.0-flash-preview-image-generation` | Gemini 2.0 Flash image generation |

### Imagen Models

These models use the dedicated `generateImages` API.

| Model | Description |
|-------|-------------|
| `imagen-4.0-ultra-generate-001` | Best quality Imagen image generation |
| `imagen-4.0-generate-001` | High quality Imagen image generation |
| `imagen-4.0-fast-generate-001` | Fast Imagen image generation |
| `imagen-3.0-generate-002` | Imagen 3 image generation |

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

### `geminiSummarize(config?)`

Creates a Gemini summarization adapter using environment variables.

**Returns:** A Gemini summarize adapter instance.

### `createGeminiSummarize(apiKey, config?)`

Creates a Gemini summarization adapter with an explicit API key.

**Returns:** A Gemini summarize adapter instance.

### `geminiImage(model, config?)`

Creates a Gemini image adapter using environment variables. Automatically routes to the correct API based on model name — `gemini-*` models use `generateContent`, `imagen-*` models use `generateImages`.

**Parameters:**

- `model` - The model name (e.g., `"gemini-3.1-flash-image-preview"` or `"imagen-4.0-generate-001"`)
- `config.baseURL?` - Custom base URL (optional)

**Returns:** A Gemini image adapter instance.

### `createGeminiImage(model, apiKey, config?)`

Creates a Gemini image adapter with an explicit API key.

**Parameters:**

- `model` - The model name
- `apiKey` - Your Google API key
- `config.baseURL?` - Custom base URL (optional)

**Returns:** A Gemini image adapter instance.

### `geminiTTS(config?)`

Creates a Gemini TTS adapter using environment variables.

**Returns:** A Gemini TTS adapter instance.

### `createGeminiTTS(apiKey, config?)`

Creates a Gemini TTS adapter with an explicit API key.

**Returns:** A Gemini TTS adapter instance.

## Next Steps

- [Image Generation Guide](../media/image-generation) - Learn more about image generation
- [Media Generation Example](https://github.com/TanStack/ai/tree/main/examples/ts-react-media) - Full working example with Gemini and fal.ai
- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers

## Provider Tools

Google Gemini exposes several native tools beyond user-defined function calls.
Import them from `@tanstack/ai-gemini/tools` and pass them into
`chat({ tools: [...] })`.

> For the full concept, a comparison matrix, and type-gating details, see
> [Provider Tools](../tools/provider-tools.md).

### `codeExecutionTool`

Enables Gemini to execute Python code in a sandboxed environment and return
results inline. Takes no arguments — include it in the `tools` array to
activate code execution.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { codeExecutionTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Calculate the first 10 Fibonacci numbers" }],
  tools: [codeExecutionTool()],
});
```

**Supported models:** Gemini 1.5 Pro, Gemini 2.x, Gemini 2.5 and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `fileSearchTool`

Searches files that have been uploaded to the Gemini File API. Pass a
`FileSearch` config object with the corpus and file IDs to scope the search.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { fileSearchTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Find the quarterly revenue figures" }],
  tools: [
    fileSearchTool({
      fileSearchStoreNames: ["fileSearchStores/my-file-search-store-123"],
    }),
  ],
});
```

**Supported models:** Gemini 2.x and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `googleSearchTool`

Enables Gemini to query Google Search and incorporate grounded search results
into its response. Pass an optional `GoogleSearch` config or call with no
arguments to use defaults.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { googleSearchTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "What's the weather in Tokyo right now?" }],
  tools: [googleSearchTool()],
});
```

**Supported models:** Gemini 1.5 Pro, Gemini 2.x, Gemini 2.5. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `googleSearchRetrievalTool`

A retrieval-augmented variant of Google Search that returns ranked passages
from the web with configurable dynamic retrieval mode. Pass an optional
`GoogleSearchRetrieval` config.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { googleSearchRetrievalTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Explain the latest JavaScript proposals" }],
  tools: [
    googleSearchRetrievalTool({
      dynamicRetrievalConfig: { mode: "MODE_DYNAMIC", dynamicThreshold: 0.7 },
    }),
  ],
});
```

**Supported models:** Gemini 1.5 Pro and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `googleMapsTool`

Connects Gemini to the Google Maps API for location-aware queries such as
directions, place search, and geocoding. Pass an optional `GoogleMaps` config
or call with no arguments.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { googleMapsTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Find coffee shops near Union Square, SF" }],
  tools: [googleMapsTool()],
});
```

**Supported models:** Gemini 2.5 and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `urlContextTool`

Fetches and includes the content of URLs mentioned in the conversation so
Gemini can reason over live web pages. Takes no arguments.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { urlContextTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Summarise https://example.com/article" }],
  tools: [urlContextTool()],
});
```

**Supported models:** Gemini 2.x and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).

### `computerUseTool`

Allows Gemini to observe a virtual desktop via screenshots and interact with
it using predefined computer-use functions. Provide the `environment` and
optionally restrict callable functions via `excludedPredefinedFunctions`.

```typescript
import { chat } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";
import { computerUseTool } from "@tanstack/ai-gemini/tools";

const stream = chat({
  adapter: geminiText("gemini-2.5-pro"),
  messages: [{ role: "user", content: "Navigate to example.com in the browser" }],
  tools: [
    computerUseTool({
      environment: "browser",
    }),
  ],
});
```

**Supported models:** Gemini 2.5 and above. See [Provider Tools](../tools/provider-tools.md#which-models-support-which-tools).
