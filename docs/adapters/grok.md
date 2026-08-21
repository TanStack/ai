---
title: Grok (xAI)
id: grok-adapter
order: 5
description: "Use xAI Grok models with TanStack AI — Grok 4.3, Grok Build 0.1, Grok Imagine image generation, and Grok Imagine video generation via @tanstack/ai-grok."
keywords:
  - tanstack ai
  - grok
  - xai
  - grok 4.3
  - grok build
  - image generation
  - video generation
  - grok imagine
  - adapter
---

The Grok text and summarization adapters provide access to xAI's Responses API for `grok-4.3` and `grok-build-0.1`, plus Grok Imagine image generation and Grok Imagine video generation.

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

## Grok on Vertex

Use `@tanstack/ai-grok/vertex` when Grok must run on Vertex AI. That path
uses Google Cloud credentials and Vertex regional or global endpoints.

```bash
npm install @tanstack/ai-grok google-auth-library
```

```typescript
import { chat } from "@tanstack/ai";
import { grokVertexText } from "@tanstack/ai-grok/vertex";

const stream = chat({
  adapter: grokVertexText("grok-4.3", {
    project: "my-project",
    location: "global",
  }),
  messages: [{ role: "user", content: "Hello!" }],
});
```

`project` and `location` use the same names as `@tanstack/ai-vertex`. If you
omit `location`, the factory uses `global`.

`grokVertexText` accepts only the Grok chat models that Vertex lists:

- `grok-4.3`
- `grok-4.20-reasoning`
- `grok-4.20-non-reasoning`
- `grok-4.1-fast-reasoning`
- `grok-4.1-fast-non-reasoning`

xAI API models such as `grok-4.6` and `grok-build-0.1` are not on Vertex.

The adapter sends the Vertex model id `xai/grok-4.3`. Install
`google-auth-library` for Application Default Credentials, or pass
`authClient` or `getAccessToken`.

Use `grokVertexSummarize` from the same entry when you need summarize on
Vertex.

Gemini on Vertex lives in [`@tanstack/ai-vertex`](./vertex).

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

The grok-imagine models (`grok-imagine-image`, `grok-imagine-image-2.0`,
`grok-imagine-image-quality`) are aspect-ratio sized — `size` takes an
`aspectRatio_resolution` template like `"16:9_2k"` (the `_2k` suffix is
optional). `grok-imagine-image-2.0` is xAI's recommended model and adds a
2.0-only `quality` provider option (`'low' | 'medium'`, default `'medium'`):

```typescript
import { generateImage } from "@tanstack/ai";
import { grokImage } from "@tanstack/ai-grok";

const result = await generateImage({
  adapter: grokImage("grok-imagine-image-2.0"),
  prompt: "A futuristic cityscape at sunset",
  size: "16:9_2k",
  modelOptions: { quality: "medium" },
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

## Video Generation (Experimental)

Generate short video clips (1–15 seconds, with audio) with the Grok Imagine video models via xAI's asynchronous jobs/polling API.

Available models:

- `grok-imagine-video` (v1.0) — text-to-video, image-to-video, and source-video edit / extend, $0.05 per second of video.
- `grok-imagine-video-1.5` — xAI's recommended default, $0.08 per second of video. Supports text-to-video (with native 1080p), image-to-video, and reference-to-video. It does not accept a source video.

Text-to-video:

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { grokVideo } from "@tanstack/ai-grok";

const adapter = grokVideo("grok-imagine-video-1.5");

// 1. Create the job
const { jobId } = await generateVideo({
  adapter,
  prompt: "A red panda balancing on a bamboo stalk in the rain",
  size: "16:9_720p", // "aspectRatio" or "aspectRatio_resolution"
  duration: 5, // integer seconds, 1–15
});

// 2. Poll until complete, then read the video URL
let status = await getVideoJobStatus({ adapter, jobId });
while (status.status !== "completed" && status.status !== "failed") {
  await new Promise((r) => setTimeout(r, 5000));
  status = await getVideoJobStatus({ adapter, jobId });
}

console.log(status.url); // hosted .mp4 URL
```

For image-to-video, include an `image` prompt part as the starting frame and describe the desired motion in the text part. URL sources are fetched by xAI's servers (so they must be publicly reachable); use a `data` source for a base64 starting frame:

```typescript
import { generateVideo } from "@tanstack/ai";
import { grokVideo } from "@tanstack/ai-grok";

const { jobId } = await generateVideo({
  adapter: grokVideo("grok-imagine-video-1.5"),
  prompt: [
    {
      type: "text",
      content: "Make the waterfall crash down and slowly pan out the camera",
    },
    {
      type: "image",
      source: { type: "url", value: "https://example.com/waterfall-still.png" },
    },
  ],
  size: "16:9_720p",
  duration: 10,
});
```

Like the Grok Imagine image models, sizing is aspect-ratio based: the `size` option takes an `aspectRatio_resolution` template. Supported aspect ratios are `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, and `2:3`; supported resolutions are `480p`, `720p`, and (on `grok-imagine-video-1.5` text-to-video / image-to-video only) `1080p` (e.g. `"9:16_1080p"`). The resolution suffix is optional.

### Reference-to-Video

On `grok-imagine-video-1.5`, image prompt parts with `metadata.role: 'reference'` (or `'character'`) become `reference_images` — they guide subjects and style without locking the first frame, and are addressed from the prompt text as `<IMAGE_0>`, `<IMAGE_1>`, … in request order. Preset TTS voices (up to 3) can be referenced for generated speech via `modelOptions.reference_audios`, addressed as `<AUDIO_0>`, `<AUDIO_1>`, `<AUDIO_2>`. Reference-to-video output is capped at 720p. A starting-frame image and reference inputs cannot be combined — xAI rejects that mix with 400. Reference inputs are a 1.5-only feature — the adapter rejects them on `grok-imagine-video`:

```typescript
import { generateVideo } from "@tanstack/ai";
import { grokVideo } from "@tanstack/ai-grok";

const { jobId } = await generateVideo({
  adapter: grokVideo("grok-imagine-video-1.5"),
  prompt: [
    {
      type: "text",
      content: "<IMAGE_0> walks through a neon-lit alley while <AUDIO_0> narrates",
    },
    {
      type: "image",
      source: { type: "url", value: "https://example.com/character.png" },
      metadata: { role: "reference" },
    },
  ],
  size: "16:9_720p",
  modelOptions: {
    reference_audios: [{ voice_id: "eve" }],
  },
});
```

### Video Editing and Extension

`grok-imagine-video` (v1.0) can rewrite or continue an existing clip. `grok-imagine-video-1.5` has no video input — the adapter rejects a source-video part or `mode` on that model. Pass the source clip as a `video` prompt part and pick the mode with `modelOptions.mode`:

- `mode: 'edit'` posts to `/v1/videos/edits` — modifies only what the prompt asks for, keeping the rest of the clip intact. Duration, aspect ratio, and resolution are inherited from the source (capped at 720p), so the adapter rejects `size`, `aspect_ratio`, `resolution`, and `duration` in this mode rather than sending fields the API ignores.
- `mode: 'extend'` posts to `/v1/videos/extensions` — continues the clip. `duration` is the length of the **added tail**, not the total: extending a 10-second clip with `duration: 5` yields 15 seconds. Output geometry is still inherited from the source, so `size` / `aspect_ratio` / `resolution` are rejected here too.

```typescript
import { generateVideo } from "@tanstack/ai";
import { grokVideo } from "@tanstack/ai-grok";

const adapter = grokVideo("grok-imagine-video");

// Edit: change the clip in place
const edit = await generateVideo({
  adapter,
  prompt: [
    { type: "text", content: "Make the sky stormy with distant lightning" },
    {
      type: "video",
      source: { type: "url", value: "https://example.com/clip.mp4" },
    },
  ],
  modelOptions: { mode: "edit" },
});

// Extend: append 5 more seconds
const extension = await generateVideo({
  adapter,
  prompt: [
    { type: "text", content: "The camera keeps panning right across the bay" },
    {
      type: "video",
      source: { type: "url", value: "https://example.com/clip.mp4" },
    },
  ],
  duration: 5, // added seconds, not the total
  modelOptions: { mode: "extend" },
});
```

Both return the usual `{ jobId }` and are polled like any other Grok video job.

When the job completes, the adapter reports usage on the result: `usage.billed` carries the billed seconds of video (`{ quantity, unit: 'seconds' }`) and `usage.cost` the exact cost in USD, both as returned by the xAI API.

See [Video Generation](../media/video-generation) for the full jobs/polling flow, streaming mode, and the `useGenerateVideo` hook.

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

Grok also exposes a Realtime voice adapter (`grokRealtime`) and a token issuer (`grokRealtimeToken`) for low-latency voice conversations. The default model is `grok-voice-think-fast-2.0` (xAI's current recommended speech-to-speech model); `grok-voice-latest` always points at the newest model. The 1.0 ids remain accepted for compatibility, but xAI has deprecated `grok-voice-think-fast-1.0`. See [Realtime Voice Chat](../media/realtime-chat) for the end-to-end flow.

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

### `grokVideo(model, config?)` / `createGrokVideo(model, apiKey, config?)`

Creates a Grok video generation adapter (experimental) for the Grok Imagine video models (`'grok-imagine-video'`, `'grok-imagine-video-1.5'`).

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
