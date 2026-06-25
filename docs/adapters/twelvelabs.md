---
title: TwelveLabs
id: twelvelabs-adapter
order: 9
description: "Understand video with TwelveLabs Pegasus in TanStack AI — summaries, Q&A, chapters, and structured output via the @tanstack/ai-twelvelabs adapter."
keywords:
  - tanstack ai
  - twelvelabs
  - pegasus
  - video understanding
  - multimodal
  - adapter
---

The TwelveLabs adapter brings video understanding to TanStack AI. [TwelveLabs](https://twelvelabs.io) builds video-native foundation models; **Pegasus** reasons over a video and returns prompt-guided text — summaries, Q&A, chapters, and highlights. The adapter plugs Pegasus into the standard `chat()` and `summarize()` activities: include a video content part in a message, ask a question, and stream back text.

## Installation

```bash
npm install @tanstack/ai-twelvelabs
```

Set `TWELVELABS_API_KEY` in your environment, or pass the key explicitly. You can grab a free API key at [twelvelabs.io](https://twelvelabs.io) — there's a generous free tier.

## Basic Usage

```typescript
import { chat } from "@tanstack/ai";
import { twelvelabsText } from "@tanstack/ai-twelvelabs";

const stream = chat({
  adapter: twelvelabsText("pegasus1.5"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", content: "Summarize this video in one paragraph." },
        {
          type: "video",
          source: { type: "url", value: "https://example.com/clip.mp4" },
        },
      ],
    },
  ],
});

for await (const chunk of stream) {
  if (chunk.type === "TEXT_MESSAGE_CONTENT") {
    process.stdout.write(chunk.delta);
  }
}
```

## Supplying the Video

A video can be supplied three ways:

- **URL** — `{ type: "video", source: { type: "url", value } }`. Use a direct link to a raw media file; video-hosting-platform and cloud-storage sharing links are not supported.
- **Inline base64** — `{ type: "video", source: { type: "data", value, mimeType } }`. Max 30 MB.
- **Pre-uploaded asset** — set `modelOptions.assetId`. It takes precedence over any inline video part in the messages.

## Custom API Key

```typescript
import { chat } from "@tanstack/ai";
import { createTwelveLabsText } from "@tanstack/ai-twelvelabs";

const adapter = createTwelveLabsText("pegasus1.5", process.env.TWELVELABS_API_KEY!);

const stream = chat({
  adapter,
  messages: [
    {
      role: "user",
      content: [
        { type: "text", content: "What happens in this clip?" },
        { type: "video", source: { type: "url", value: "https://example.com/clip.mp4" } },
      ],
    },
  ],
});
```

## Provider Options

```typescript
import { chat } from "@tanstack/ai";
import { twelvelabsText } from "@tanstack/ai-twelvelabs";

const stream = chat({
  adapter: twelvelabsText("pegasus1.5"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", content: "Describe what happens." },
        { type: "video", source: { type: "url", value: "https://example.com/clip.mp4" } },
      ],
    },
  ],
  modelOptions: {
    temperature: 0.2,
    maxTokens: 2048,
    // Analyze only seconds 10–30 of the video (Pegasus 1.5).
    startTime: 10,
    endTime: 30,
  },
});
```

| Option        | Description                                                       |
| ------------- | ----------------------------------------------------------------- |
| `temperature` | Sampling temperature, `0`–`1`. Default `0.2`.                     |
| `maxTokens`   | Maximum response length, in tokens.                               |
| `startTime`   | Start of the analysis window, in seconds (Pegasus 1.5).           |
| `endTime`     | End of the analysis window, in seconds (Pegasus 1.5).             |
| `assetId`     | Analyze a previously uploaded TwelveLabs asset instead of inline. |

## Structured Output

Pegasus supports a `json_schema` response format. Pass an `outputSchema` to `chat()` and the adapter constrains the model's output to it:

```typescript
import { chat } from "@tanstack/ai";
import { twelvelabsText } from "@tanstack/ai-twelvelabs";
import { z } from "zod";

const result = await chat({
  adapter: twelvelabsText("pegasus1.5"),
  messages: [
    {
      role: "user",
      content: [
        { type: "text", content: "Extract the summary and topics." },
        { type: "video", source: { type: "url", value: "https://example.com/clip.mp4" } },
      ],
    },
  ],
  outputSchema: z.object({
    summary: z.string(),
    topics: z.array(z.string()),
  }),
});
```

## Models

| Model        | Use                                                               |
| ------------ | ----------------------------------------------------------------- |
| `pegasus1.5` | Video understanding with clip windowing and a larger token budget |
| `pegasus1.2` | General video understanding (legacy)                              |

`TWELVELABS_EMBEDDING_MODELS` (`marengo3.0`) is also exported for reference — Marengo produces 512-dim multimodal embeddings over a shared text/image/audio/video space. TanStack AI does not yet expose an embeddings activity, so this adapter focuses on the Pegasus video-understanding path.
