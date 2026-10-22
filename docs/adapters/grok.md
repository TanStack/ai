---
title: Grok (xAI)
id: grok-adapter
order: 5
description: "Use xAI Grok models in TanStack AI with @tanstack/ai-grok: Grok chat on the Responses API, Grok Imagine images and video, speech, transcription, and realtime voice."
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

The Grok adapter calls xAI chat models on the Responses API. It also calls Grok Imagine for images and video, plus speech, transcription, and realtime voice.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-grok
vue: @tanstack/ai-grok
solid: @tanstack/ai-grok
svelte: @tanstack/ai-grok
preact: @tanstack/ai-grok
angular: @tanstack/ai-grok
vanilla: @tanstack/ai-grok
octane: @tanstack/ai-grok

<!-- ::end:tabs -->

## 2. Set the API key

Put the key in the environment of your server:

```bash
XAI_API_KEY=xai-...
```

`grokText` and the other short factories read `XAI_API_KEY`. To pass the key in code, use the `create*` factory of the same adapter:

```typescript
import { createGrokText } from "@tanstack/ai-grok";

const adapter = createGrokText("grok-4.7", process.env.XAI_API_KEY!);
```

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: grokText("grok-4.7"),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

## 4. Render the chat

The client is the same for every provider. Point `useChat` at your route:

```tsx
import { useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

export function Chat() {
  const [input, setInput] = useState("");
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    threadId: "support-chat",
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        sendMessage(input);
        setInput("");
      }}
    >
      {messages.map((message) => (
        <p key={message.id}>
          {message.parts
            .map((part) => (part.type === "text" ? part.content : ""))
            .join("")}
        </p>
      ))}
      <input value={input} onChange={(event) => setInput(event.target.value)} />
    </form>
  );
}
```

For Vue, Solid, Svelte, Angular, and the other frameworks, see [Quick Start](../getting-started/quick-start#3-render-the-chat).

You now have a streaming Grok chat. [Tools](../tools/tools) and [Structured Outputs](../structured-outputs/overview) work the same as with every adapter.

## Images

```typescript
import { generateImage } from "@tanstack/ai";
import { grokImage } from "@tanstack/ai-grok";

const result = await generateImage({
  adapter: grokImage("grok-imagine-image-2.0"),
  prompt: "A futuristic cityscape at sunset",
  threadId: "thread-1",
  size: "16:9_2k",
  modelOptions: { quality: "medium" },
});
```

- The image models (`grok-imagine-image`, `grok-imagine-image-2.0`, `grok-imagine-image-quality`) take an aspect ratio as the size. `size` takes an `aspectRatio_resolution` template like `"16:9_2k"`. The `_2k` part is optional.
- `grok-imagine-image-2.0` is the model that xAI recommends. It adds a `quality` option (`'low'` or `'medium'`, default `'medium'`).
- To change an existing image, see [Image editing](#image-editing).

## Video

Grok Imagine makes short clips (1 to 15 seconds, with audio). Video generation is experimental. You start a job, then poll it:

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { grokVideo } from "@tanstack/ai-grok";

const adapter = grokVideo("grok-imagine-video-1.5");

// 1. Create the job
const { jobId } = await generateVideo({
  adapter,
  prompt: "A red panda balancing on a bamboo stalk in the rain",
  threadId: "thread-1",
  size: "16:9_720p", // "aspectRatio" or "aspectRatio_resolution"
  duration: 5, // integer seconds, 1 to 15
});

// 2. Poll until complete, then read the video URL
let status = await getVideoJobStatus({ adapter, jobId });
while (status.status !== "completed" && status.status !== "failed") {
  await new Promise((r) => setTimeout(r, 5000));
  status = await getVideoJobStatus({ adapter, jobId });
}

console.log(status.url); // hosted .mp4 URL
```

- `grok-imagine-video-1.5` is the default that xAI recommends. It does text-to-video (with native 1080p), image-to-video, and reference-to-video.
- `grok-imagine-video` (v1.0) also edits and extends a source video.

Image-to-video, references, edits, and sizes are in [Video options](#video-options). For the full flow and the `useGenerateVideo` hook, see [Video Generation](../media/video-generation).

## Speech

```typescript
import { generateSpeech } from "@tanstack/ai";
import { grokSpeech } from "@tanstack/ai-grok";

const result = await generateSpeech({
  adapter: grokSpeech("grok-tts"),
  text: "Hello from Grok!",
  threadId: "thread-1",
  voice: "default",
  format: "mp3",
});

console.log(result.audio); // Base64-encoded audio
```

## Transcription

```typescript
import { generateTranscription } from "@tanstack/ai";
import { grokTranscription } from "@tanstack/ai-grok";
import { audioFile } from "./audio";

const result = await generateTranscription({
  adapter: grokTranscription("grok-stt"),
  audio: audioFile,
  threadId: "thread-1",
});

console.log(result.text);
```

## Summarization

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
  threadId: "thread-1",
  maxLength: 100,
  style: "concise", // "concise" | "bullet-points" | "paragraph"
});

console.log(result.summary);
```

## Realtime voice and files

- **Realtime voice**: `grokRealtime` and the token issuer `grokRealtimeToken` run a live voice chat. The default model is `grok-voice-think-fast-2.0`. `grok-voice-latest` always points to the newest model. See [Realtime Voice Chat](../media/realtime-chat).
- **Files**: `grokFiles` uploads media to the xAI Files API. See [Files API](../advanced/files-api).

## Provider tools

xAI runs some tools itself. Import them from `@tanstack/ai-grok/tools` and add them to `tools`:

```typescript
import { chat } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";
import { grokWebSearchTool } from "@tanstack/ai-grok/tools";

const stream = chat({
  adapter: grokText("grok-4.3"),
  messages: [{ role: "user", content: "What's new in AI this week?" }],
  threadId: "thread-1",
  tools: [grokWebSearchTool()],
});
```

- `grokWebSearchTool`: search the web. `filters` takes up to 5 `allowed_domains` or up to 5 `excluded_domains`, not both.
- `grokXSearchTool`: search posts on X. Takes up to 20 `allowed_x_handles` or up to 20 `excluded_x_handles`, not both.
- `grokFileSearchTool`: search your xAI file collections with `vector_store_ids`. `max_num_results` is 1 to 50.
- `grokMCPTool`: connect a remote MCP server with `server_url` and `server_label`.

**Supported models:** `grok-4.3` and `grok-build-0.1`. For your own tools, use `toolDefinition()`. See [Tools](../tools/tools.md).

## Models and options

### Model options

Provider options go in `modelOptions`, with the names of the xAI Responses API. This includes the sampling options `temperature`, `top_p`, and `max_output_tokens`:

```typescript
import { chat } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

const stream = chat({
  adapter: grokText("grok-4.7"),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
  modelOptions: {
    temperature: 0.7,
    top_p: 0.9,
    max_output_tokens: 1024,
    store: false,
    include: ["reasoning.encrypted_content"],
  },
});
```

- Requests use `store: false` by default, and include the encrypted reasoning with `include: ["reasoning.encrypted_content"]`. You can change both in `modelOptions`.
- Sampling options do not go at the root of `chat()`. See [Moving Sampling Options into modelOptions](../migration/sampling-options-to-model-options).

### Reasoning

Want Grok to think harder? Set `reasoning` on `chat()`. It goes out as `reasoning.effort`, with a summary so that the thinking text streams:

```typescript
import { chat } from "@tanstack/ai";
import { grokText } from "@tanstack/ai-grok";

const stream = chat({
  adapter: grokText("grok-4.7"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  threadId: "thread-1",
  reasoning: "xhigh",
});
```

| Model | Levels |
| --- | --- |
| `grok-4.7`, `grok-4.6` | `low` to `xhigh` |
| `grok-4.5` | `low`, `medium`, `high` |
| `grok-4.3` | `off`, `low`, `medium`, `high` |

- `grok-build-0.1` and the `non-reasoning` models take no `reasoning`.
- `grok-4.20-reasoning` and `grok-4.1-fast-reasoning` take no `reasoning` either. They always think, and have no levels.

### Models

| Activity | Factory | Models |
| --- | --- | --- |
| Chat | `grokText` | `grok-4.7`, `grok-4.6`, `grok-4.5`, `grok-4.3`, `grok-build-0.1` |
| Chat on Vertex | `grokVertexText` | `grok-4.3`, `grok-4.20-reasoning`, `grok-4.20-non-reasoning`, `grok-4.1-fast-reasoning`, `grok-4.1-fast-non-reasoning` |
| Images | `grokImage` | `grok-imagine-image-2.0`, `grok-imagine-image`, `grok-imagine-image-quality` |
| Video | `grokVideo` | `grok-imagine-video-1.5`, `grok-imagine-video` |
| Speech | `grokSpeech` | `grok-tts` |
| Transcription | `grokTranscription` | `grok-stt` |
| Realtime voice | `grokRealtime` | `grok-voice-think-fast-2.0`, `grok-voice-latest`, `grok-voice-fast-1.0` |

`adapter.inputModalities` lists the input kinds of the selected model. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

## Advanced

### Configuration

```typescript
import { createGrokText, type GrokTextConfig } from "@tanstack/ai-grok";

const config: Omit<GrokTextConfig, "apiKey"> = {
  baseURL: "https://api.x.ai/v1", // Optional, this is the default
};

const adapter = createGrokText("grok-4.7", process.env.XAI_API_KEY!, config);
```

- Need a header on each request, or a log of each model call? The chat adapters of this package support [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).
- The text and summarize adapters use the xAI **Responses API** (`/v1/responses`). They support streaming text, reasoning events, structured output through `text.format`, and function tools.

### Grok on Vertex

Use `@tanstack/ai-grok/vertex` when Grok must run on Vertex AI. That path uses Google Cloud credentials and the regional or global endpoints of Vertex.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-grok google-auth-library
vue: @tanstack/ai-grok google-auth-library
solid: @tanstack/ai-grok google-auth-library
svelte: @tanstack/ai-grok google-auth-library
preact: @tanstack/ai-grok google-auth-library
angular: @tanstack/ai-grok google-auth-library
vanilla: @tanstack/ai-grok google-auth-library
octane: @tanstack/ai-grok google-auth-library

<!-- ::end:tabs -->

```typescript
import { chat } from "@tanstack/ai";
import { grokVertexText } from "@tanstack/ai-grok/vertex";

const stream = chat({
  adapter: grokVertexText("grok-4.3", {
    project: "my-project",
    location: "global",
  }),
  messages: [{ role: "user", content: "Hello!" }],
  threadId: "thread-1",
});
```

- `project` and `location` use the same names as `@tanstack/ai-vertex`. If you omit `location`, the factory uses `global`.
- `grokVertexText` accepts only the Grok chat models that Vertex lists. See the [model table](#models). xAI API models such as `grok-4.6` and `grok-build-0.1` are not on Vertex.
- The adapter sends the Vertex model id `xai/grok-4.3`.
- Install `google-auth-library` for Application Default Credentials, or pass `authClient` or `getAccessToken`.
- For summarize on Vertex, use `grokVertexSummarize` from the same entry.

Gemini on Vertex is in [`@tanstack/ai-vertex`](./vertex).

### Image editing

The grok-imagine models take image prompt parts. The adapter then calls the `/v1/images/edits` endpoint of xAI.

- You can send up to 3 source images. xAI reads them in the order of the prompt.
- xAI has no syntax to point to an image in the prompt. Write the prompt in plain words. Your text goes out without changes.

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
  threadId: "thread-1",
});
```

The servers of xAI fetch URL sources, so the URLs must be public. For a private image, use a `data` source.

### Video options

#### Sizes

The video `size` takes an `aspectRatio_resolution` template. The resolution part is optional.

- Aspect ratios: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, and `2:3`.
- Resolutions: `480p` and `720p`. `1080p` (for example `"9:16_1080p"`) works only on `grok-imagine-video-1.5` for text-to-video and image-to-video.
- Price: `grok-imagine-video` costs $0.05 per second of video. `grok-imagine-video-1.5` costs $0.08 per second.

#### Image-to-video

Add an `image` prompt part as the first frame. Describe the motion in the text part. The servers of xAI fetch URL sources, so they must be public. For a base64 first frame, use a `data` source.

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
  threadId: "thread-1",
  size: "16:9_720p",
  duration: 10,
});
```

#### Reference-to-video

On `grok-imagine-video-1.5`, image parts with `metadata.role: 'reference'` (or `'character'`) become `reference_images`. They guide subjects and style, but do not lock the first frame. The prompt text names them `<IMAGE_0>`, `<IMAGE_1>`, and so on, in request order.

- `modelOptions.reference_audios` takes up to 3 preset TTS voices for generated speech. The prompt names them `<AUDIO_0>`, `<AUDIO_1>`, `<AUDIO_2>`.
- You can add a first-frame image to the references. The first frame fixes the opening frame, and the references guide subjects, style, and voices.
- The output of reference-to-video is at most 720p.
- References work only on 1.5. The adapter rejects them on `grok-imagine-video`.

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
      source: { type: "url", value: "https://example.com/opening-frame.png" },
      metadata: { role: "start_frame" },
    },
    {
      type: "image",
      source: { type: "url", value: "https://example.com/character.png" },
      metadata: { role: "reference" },
    },
  ],
  threadId: "thread-1",
  size: "16:9_720p",
  modelOptions: {
    reference_audios: [{ voice_id: "eve" }],
  },
});
```

#### Edit and extend a video

`grok-imagine-video` (v1.0) can change or continue a clip. `grok-imagine-video-1.5` takes no video input, so the adapter rejects a source-video part or `mode` on that model. Pass the source clip as a `video` prompt part and pick the mode with `modelOptions.mode`:

- `mode: 'edit'` posts to `/v1/videos/edits`. It changes only what the prompt asks for. The clip keeps the duration, aspect ratio, and resolution of the source (at most 720p). So the adapter rejects `size`, `aspect_ratio`, `resolution`, and `duration` in this mode.
- `mode: 'extend'` posts to `/v1/videos/extensions`. It continues the clip. `duration` is the length of the **added part**, not the total: extending a 10-second clip with `duration: 5` gives 15 seconds. The size still comes from the source, so the adapter rejects `size`, `aspect_ratio`, and `resolution`.

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
  threadId: "thread-1",
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
  threadId: "thread-1",
  duration: 5, // added seconds, not the total
  modelOptions: { mode: "extend" },
});
```

Both return the usual `{ jobId }`. Poll them like any other Grok video job.

When the job is complete, the result has the usage from the xAI API:

- `usage.billed`: the billed seconds of video (`{ quantity, unit: 'seconds' }`).
- `usage.cost`: the exact cost in USD.

### API reference

Each factory pair has the same shape. The short factory reads `XAI_API_KEY` from the environment. The `create*` factory takes an explicit API key. Both take `model` as the first argument.

| Factories | Creates |
| --- | --- |
| `grokText(model, config?)` / `createGrokText(model, apiKey, config?)` | Text adapter |
| `grokSummarize(model, config?)` / `createGrokSummarize(model, apiKey, config?)` | Summarization adapter |
| `grokImage(model, config?)` / `createGrokImage(model, apiKey, config?)` | Image adapter |
| `grokVideo(model, config?)` / `createGrokVideo(model, apiKey, config?)` | Video adapter for the Grok Imagine video models. Experimental |
| `grokSpeech(model, config?)` / `createGrokSpeech(model, apiKey, config?)` | Text-to-speech adapter |
| `grokTranscription(model, config?)` / `createGrokTranscription(model, apiKey, config?)` | Speech-to-text adapter |
| `grokFiles` / `createGrokFiles` | Files API adapter. See [Files API](../advanced/files-api) |
| `grokRealtime(...)` / `grokRealtimeToken(...)` | Realtime voice adapter and token issuer. See [Realtime Voice Chat](../media/realtime-chat) |
| `grokVertexText` / `grokVertexSummarize` | Text and summarize adapters on Vertex. Import from `@tanstack/ai-grok/vertex` |

`config.baseURL` sets a custom base URL. `adapter.inputModalities` lists the input kinds of the selected model. It is `undefined` for a model that this package does not know.
