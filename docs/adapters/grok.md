---
title: Grok (xAI)
id: grok-adapter
order: 5
description: "Use xAI Grok Responses models with TanStack AI — Grok 4.3 and Grok Build 0.1 via @tanstack/ai-grok."
keywords:
  - tanstack ai
  - grok
  - xai
  - grok 4.3
  - grok build
  - adapter
---

The Grok text and summarization adapters provide access to xAI's Responses API for `grok-4.3` and `grok-build-0.1`.

## Installation

```bash
npm install @tanstack/ai-grok
```

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

const stream = chat({
  adapter: grokText("grok-build-0.1"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

## Basic Usage - Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createGrokText } from "@tanstack/ai-grok";

const adapter = createGrokText("grok-build-0.1", process.env.XAI_API_KEY!);

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

const adapter = createGrokText("grok-build-0.1", process.env.XAI_API_KEY!, config);
```

## Example: Chat Completion

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: grokText("grok-build-0.1"),
    messages,
  });

  return toServerSentEventsResponse(stream);
}
```

## Example: With Tools

```typescript
import { chat, toServerSentEventsResponse, toolDefinition } from "@tanstack/ai";
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

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: grokText("grok-build-0.1"),
    messages,
    tools: [getWeather],
  });

  return toServerSentEventsResponse(stream);
}
```

## Model Options

Grok supports xAI Responses API options. Sampling parameters live here too — `temperature`, `top_p`, and `max_output_tokens` — rather than as root-level props on `chat()`:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

export async function POST(request: Request) {
  const { messages } = await request.json();

  const stream = chat({
    adapter: grokText("grok-build-0.1"),
    messages,
    modelOptions: {
      temperature: 0.7,
      top_p: 0.9,
      max_output_tokens: 1024,
      store: false,
      include: ["reasoning.encrypted_content"],
    },
  });

  return toServerSentEventsResponse(stream);
}
```

> If you previously passed `temperature` / `topP` / `maxTokens` at the root of `chat()`, see [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

## Summarization

Summarize long text content:

<!-- ignored: grokSummarize()'s resolved provider-options type sits in a
     contravariant position in SummarizeAdapter, so it isn't assignable to
     summarize()'s adapter param for any current Grok model. Tracked in #821;
     un-ignore once the adapter type is corrected. -->

```typescript ignore
import { summarize } from "@tanstack/ai";
import { grokSummarize } from "@tanstack/ai-grok";

const result = await summarize({
  adapter: grokSummarize("grok-4.3"),
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

The grok-imagine models (`grok-imagine-image`, `grok-imagine-image-quality`)
are aspect-ratio sized — `size` takes an `aspectRatio_resolution` template
like `"16:9_2k"` (the `_2k` suffix is optional):

```typescript
import { generateImage } from "@tanstack/ai";
import { grokImage } from "@tanstack/ai-grok";

const result = await generateImage({
  adapter: grokImage("grok-imagine-image"),
  prompt: "A futuristic cityscape at sunset",
  size: "16:9_2k",
});
```

### Image Editing (image-to-image)

The grok-imagine models accept image prompt parts for image-conditioned
generation via xAI's `/v1/images/edits` endpoint — up to 3 source images,
addressed by xAI in the order they appear in the prompt. Per xAI's docs
there is no in-prompt referencing syntax; write the prompt naturally and
your text is sent verbatim:

```typescript
import { generateImage } from "@tanstack/ai";
import { grokImage } from "@tanstack/ai-grok";

const result = await generateImage({
  adapter: grokImage("grok-imagine-image"),
  prompt: [
    {
      type: "text",
      content: "Render the product in the style of the second image",
    },
    {
      type: "image",
      source: { type: "url", value: "https://example.com/product.png" },
    },
    {
      type: "image",
      source: { type: "url", value: "https://example.com/style.png" },
    },
  ],
});
```

URL sources are fetched by xAI's servers, so they must be publicly
reachable; use a `data` source for private images. `grok-2-image-1212` is
text-to-image only — image prompt parts are a compile-time type error and
throw at runtime.

## Text-to-Speech

Generate speech with Grok TTS:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { grokSpeech } from "@tanstack/ai-grok";

const result = await generateSpeech({
  adapter: grokSpeech("grok-tts"),
  text: "Hello from Grok!",
  voice: "default",
  format: "mp3",
});

console.log(result.audio); // Base64-encoded audio
```

## Transcription

Transcribe audio with Grok STT:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { grokTranscription } from "@tanstack/ai-grok";
import { audioFile } from "./audio";

const result = await generateTranscription({
  adapter: grokTranscription("grok-stt"),
  audio: audioFile,
});

console.log(result.text);
```

## Realtime Voice

Grok also exposes a Realtime voice adapter (`grokRealtime`) and a token issuer (`grokRealtimeToken`) for low-latency voice conversations. See [Realtime Voice Chat](../media/realtime-chat) for the end-to-end flow.

## Environment Variables

Set your API key in environment variables:

```bash
XAI_API_KEY=xai-...
```

## Implementation Notes

### Responses API

The Grok text and summarize adapters use xAI's **Responses API** (`/v1/responses`). Requests default to `store: false` and include encrypted reasoning content with `include: ["reasoning.encrypted_content"]`; both can be overridden through `modelOptions`.

The shared Responses implementation supports streaming text, reasoning events, structured output via `text.format`, and user-defined function tools.

## API Reference

### `grokText(model, config?)`

Creates a Grok text adapter using environment variables.

**Parameters:**

- `model` - The model name (`'grok-4.3'` or `'grok-build-0.1'`)
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

### `grokImage(model, config?)` / `createGrokImage(model, apiKey, config?)`

Creates a Grok image generation adapter.

### `grokSpeech(model, config?)` / `createGrokSpeech(model, apiKey, config?)`

Creates a Grok text-to-speech adapter.

### `grokTranscription(model, config?)` / `createGrokTranscription(model, apiKey, config?)`

Creates a Grok speech-to-text adapter.

### `grokRealtime(...)` / `grokRealtimeToken(...)`

Realtime voice adapter and token issuer. See [Realtime Voice Chat](../media/realtime-chat) for usage.

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Tools Guide](../tools/tools) - Learn about tools
- [Other Adapters](./openai) - Explore other providers

## Provider Tools

Grok does not currently expose provider-specific tool factories.
Define your own tools with `toolDefinition()` from `@tanstack/ai`.

See [Tools](../tools/tools.md) for the general tool-definition flow, or
[Provider Tools](../tools/provider-tools.md) for other providers'
native-tool offerings.
