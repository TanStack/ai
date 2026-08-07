---
title: Grok (xAI)
id: grok-adapter
order: 5
description: "xAI Grok text, image, video, TTS, STT, and realtime via @tanstack/ai-grok."
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

If you need xAI Grok → install, set `XAI_API_KEY`, call `grokText(model)`.

Text uses xAI **Responses API**. Defaults: `store: false`, `include: ["reasoning.encrypted_content"]`.

## Install

```bash
npm install @tanstack/ai-grok
```

```bash
XAI_API_KEY=xai-...
```

## Do this

```typescript
import { chat } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

const stream = chat({
  adapter: grokText("grok-build-0.1"),
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Explicit API key

```typescript
import { chat } from "@tanstack/ai";
import { createGrokText } from "@tanstack/ai-grok";

const adapter = createGrokText("grok-build-0.1", process.env.XAI_API_KEY!);

const stream = chat({
  adapter,
  messages: [{ role: "user", content: "Hello!" }],
});
```

### Server + tools

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

## Model options

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

> Root-level sampling migration: [modelOptions](../migration/sampling-options-to-model-options).

## Summarization

```typescript ignore
import { summarize } from "@tanstack/ai";
import { grokSummarize } from "@tanstack/ai-grok";

const result = await summarize({
  adapter: grokSummarize("grok-4.3"),
  text: "Your long text to summarize...",
  maxLength: 100,
  style: "concise",
});

console.log(result.summary);
```

## Image

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

Imagine models use `aspectRatio_resolution` (`"16:9_2k"`, `_2k` optional):

```typescript
import { generateImage } from "@tanstack/ai";
import { grokImage } from "@tanstack/ai-grok";

const result = await generateImage({
  adapter: grokImage("grok-imagine-image"),
  prompt: "A futuristic cityscape at sunset",
  size: "16:9_2k",
});
```

### Image editing

Up to 3 source images (order = xAI order). URLs must be public; use `data` for private. `grok-2-image-1212` is text-only.

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

## Video (experimental)

1–15s with audio. Poll jobs. Full flow: [Video Generation](../media/video-generation).

- `grok-imagine-video` — T2V + I2V
- `grok-imagine-video-1.5` — **I2V only** (text-only prompt fails fast)

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { grokVideo } from "@tanstack/ai-grok";

const adapter = grokVideo("grok-imagine-video");

const { jobId } = await generateVideo({
  adapter,
  prompt: "A red panda balancing on a bamboo stalk in the rain",
  size: "16:9_720p",
  duration: 5,
});

let status = await getVideoJobStatus({ adapter, jobId });
while (status.status !== "completed" && status.status !== "failed") {
  await new Promise((r) => setTimeout(r, 5000));
  status = await getVideoJobStatus({ adapter, jobId });
}

console.log(status.url);
```

I2V:

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

Ratios: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`. Res: `480p`, `720p`, `1080p`. Usage: `usage.unitsBilled` (seconds), `usage.cost` (USD).

## TTS / STT

```typescript
import { generateSpeech } from "@tanstack/ai";
import { grokSpeech } from "@tanstack/ai-grok";

const result = await generateSpeech({
  adapter: grokSpeech("grok-tts"),
  text: "Hello from Grok!",
  voice: "default",
  format: "mp3",
});

console.log(result.audio);
```

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

## Realtime voice

`grokRealtime` / `grokRealtimeToken` — see [Realtime Voice Chat](../media/realtime-chat).

## API reference

| Factory | Purpose |
| --- | --- |
| `grokText` / `createGrokText` | Chat (`grok-4.3`, `grok-build-0.1`) |
| `grokSummarize` / `createGrokSummarize` | Summarize |
| `grokImage` / `createGrokImage` | Image |
| `grokVideo` / `createGrokVideo` | Video (experimental) |
| `grokSpeech` / `createGrokSpeech` | TTS |
| `grokTranscription` / `createGrokTranscription` | STT |
| `grokRealtime` / `grokRealtimeToken` | Realtime |

`config.baseURL?` optional (default `https://api.x.ai/v1`).

No provider-tool factories — use `toolDefinition()` ([tools](../tools/tools.md)).

## Next steps

- [Getting Started](../getting-started/quick-start)
- [Tools](../tools/tools)
- [Other Adapters](./openai)
