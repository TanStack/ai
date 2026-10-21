---
title: BytePlus
id: byteplus-adapter
order: 8
description: "Use BytePlus ModelArk in TanStack AI with @tanstack/ai-byteplus: Seed chat models with reasoning, Seedance video, Seedream images, and Seed Speech text-to-speech and transcription."
keywords:
  - tanstack ai
  - byteplus
  - modelark
  - ark
  - seed
  - seedance
  - seedream
  - seed speech
  - bytedance
  - video generation
  - image generation
  - text to speech
  - transcription
  - adapter
---

BytePlus is the international model platform of ByteDance. It gives you the Seed chat models with reasoning, Seedance video, Seedream images, and Seed Speech, all from one package.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-byteplus
vue: @tanstack/ai-byteplus
solid: @tanstack/ai-byteplus
svelte: @tanstack/ai-byteplus
preact: @tanstack/ai-byteplus
angular: @tanstack/ai-byteplus
vanilla: @tanstack/ai-byteplus
octane: @tanstack/ai-byteplus

<!-- ::end:tabs -->

## 2. Set the API keys

BytePlus sells these models as two products, and each product has its own key. Put both keys in the environment of your server:

```bash
# ModelArk: chat, Seedance video, Seedream images
ARK_API_KEY=...

# Seed Speech: text-to-speech and transcription
BYTEPLUS_VOICE_API_KEY=...
```

- `byteplusText`, `byteplusVideo`, and `byteplusImage` read `ARK_API_KEY`. If it is not set, they read `BYTEPLUS_API_KEY`.
- `byteplusSpeech` and `byteplusTranscription` read `BYTEPLUS_VOICE_API_KEY`. An Ark key fails here with `45000010 Invalid X-Api-Key`.

To pass the key in code, use the `create*` factory of the same adapter:

```typescript
import { createBytePlusText } from "@tanstack/ai-byteplus";

const adapter = createBytePlusText("dola-seed-2-1-turbo-260628", process.env.ARK_API_KEY!);
```

Ark keys work in one region only. The default endpoint is Asia-Pacific south-east. For a key from another region, see [Regions](./byteplus-advanced#regions).

## 3. Stream a chat from the server

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { byteplusText } from "@tanstack/ai-byteplus";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: byteplusText("dola-seed-2-1-turbo-260628"),
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

You now have a streaming chat on BytePlus. Seed models think before they answer, and `useChat` shows that thinking as separate thinking parts. [Tools](../tools/tools) work the same as with every adapter. BytePlus has no provider tools of its own.

## Video generation (Seedance)

> Video generation is an [experimental feature](../media/video-generation).

Seedance runs as a job. `generateVideo()` starts the job and returns a `jobId`. Poll the job until it has a video URL:

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { byteplusVideo } from "@tanstack/ai-byteplus";

const adapter = byteplusVideo("dreamina-seedance-2-5-260628");

const { jobId } = await generateVideo({
  adapter,
  prompt: "a guitar being played in a store",
  size: "16:9_720p",
  duration: 5,
});

let status = await getVideoJobStatus({ adapter, jobId });
while (status.status === "pending" || status.status === "processing") {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  status = await getVideoJobStatus({ adapter, jobId });
}

console.log(status.status === "completed" ? status.url : status.error);
```

- The video URL expires 24 hours after the job completes. If you want to keep the video, download it. See [Keeping generated files](../persistence/keep-generated-files).
- `size` is a ratio (`"16:9"`) or a ratio with a resolution (`"16:9_720p"`). The ratios are `16:9`, `9:16`, `4:3`, `3:4`, `1:1`, `21:9`, and `adaptive`.
- The Seedance 2 models can need activation in the Ark Console first. Until then, a call fails with `404 ModelNotOpen`.

To run the job from a React component, and for the options of each model, see [BytePlus: Advanced](./byteplus-advanced#run-a-seedance-job-from-the-client).

## Image generation (Seedream)

```typescript
import { generateImage } from "@tanstack/ai";
import { byteplusImage } from "@tanstack/ai-byteplus";

const result = await generateImage({
  adapter: byteplusImage("dola-seedream-5-0-pro-260628"),
  prompt: "a guitar being played in a store",
  size: "2K",
  modelOptions: { watermark: false },
});

console.log(result.images[0]?.url);
```

- `watermark` is `true` by default. BytePlus then writes "AI generated" in the bottom-right corner. Set `watermark: false` to stop this.
- `size` is a token (`1K`, `2K`, `4K`) or pixels (`2048x2048`). Do not mix the two.
- `numberOfImages` is a maximum, not an exact count. The model decides how many images to return.
- Result URLs expire after 24 hours. To get the bytes in the response, set `response_format: "b64_json"` in `modelOptions`.

To edit an existing image, see [Seedream reference images](./byteplus-advanced#seedream-reference-images).

## Text-to-speech (Seed Speech)

This adapter uses `BYTEPLUS_VOICE_API_KEY`:

```typescript
import { generateSpeech } from "@tanstack/ai";
import { byteplusSpeech } from "@tanstack/ai-byteplus";

const result = await generateSpeech({
  adapter: byteplusSpeech("seed-audio-1.0"),
  text: "welcome to the guitar store",
  voice: "en_female_stokie_uranus_bigtts",
  format: "mp3",
});

console.log(result.contentType, result.audio.length);
```

- Formats: `wav`, `mp3`, `pcm`, and `ogg_opus`.
- One request makes 120 seconds of audio at most.
- `timestamps: true` gives you word timings, and `turns` makes a dialogue with up to three voices.

The voice ids, voice cloning, timings, dialogue, and watermarks are in [Seed Speech](./byteplus-advanced#seed-speech). The client half is the standard [`useGenerateSpeech` hook](../media/text-to-speech#quick-setup).

## Transcription (Seed Speech ASR)

This adapter also uses `BYTEPLUS_VOICE_API_KEY`. The call is synchronous, so you get the transcript back with no polling:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { byteplusTranscription } from "@tanstack/ai-byteplus";

const result = await generateTranscription({
  adapter: byteplusTranscription("seed-asr"),
  audio: "https://example.com/recording.mp3",
  modelOptions: { enable_punc: true, enable_speaker_info: true },
});

console.log(result.text);
for (const segment of result.segments ?? []) {
  console.log(segment.speaker, segment.text);
}
```

`audio` takes a `File`, base64, a data URL, or a public URL. The limit is two hours and 100 MB. For the other options, see [Transcription options](./byteplus-advanced#transcription-options).

## Models and options

### Model options

Ark speaks the OpenAI chat format, so the sampling options keep their OpenAI names. They go in `modelOptions`:

```typescript
import { chat } from "@tanstack/ai";
import { byteplusText } from "@tanstack/ai-byteplus";

const stream = chat({
  adapter: byteplusText("dola-seed-2-1-turbo-260628"),
  messages: [{ role: "user", content: "Hello!" }],
  modelOptions: {
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 2048,
  },
});
```

- Send `max_tokens` or `max_completion_tokens`, not both. Ark returns a `400` when you send both. The types cannot catch this.
- `repetition_penalty` and `service_tier` are Ark options. `service_tier: "flex"` sends the request to a cheaper batch queue with no latency guarantee.

Need a header on each request, or a log of each model call? The chat adapter supports [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

### Reasoning

Seed models think by default. Set how hard they think with `reasoning` on `chat()`:

```typescript
import { chat } from "@tanstack/ai";
import { byteplusText } from "@tanstack/ai-byteplus";

const stream = chat({
  adapter: byteplusText("glm-5-2-260617"),
  messages: [{ role: "user", content: "Hello!" }],
  reasoning: "off",
});
```

The levels of each model:

- `dola-seed-2-1-turbo-260628` and the `seed-*` models: `minimal` to `high`. They cannot stop thinking.
- `glm-5-2-260617`: `off` to `high`.
- `glm-4-7-251222`, `deepseek-v3-2-251201`: `off`, `high`.
- `deepseek-v4-pro-260425`, `deepseek-v4-flash-260425`: `off`, `high`, `max`.
- `gpt-oss-120b-250805`: `low`, `medium`, `high`.

What goes over the wire, and how the adapter keeps the `encrypted_content` of the reasoning, is in [Reasoning and `encrypted_content`](./byteplus-advanced#reasoning-and-encrypted_content).

### Structured output

Ten of the 18 chat models support `chat({ outputSchema })`. Use `dola-seed-2-1-turbo-260628` or `seed-2-0-lite-260228`. On the other models, the call fails with an error that names the models that work. See [Structured output](./byteplus-advanced#structured-output).

### Models

Newest first. The package exports the full lists: `BYTEPLUS_CHAT_MODELS`, `BYTEPLUS_VIDEO_MODELS`, `BYTEPLUS_IMAGE_MODELS`, `BYTEPLUS_TTS_MODELS`, and `BYTEPLUS_TRANSCRIPTION_MODELS`.

| Activity | Factory | Models |
| --- | --- | --- |
| Chat | `byteplusText` | `dola-seed-2-1-turbo-260628`, `seed-2-0-lite-260428`, `seed-2-0-mini-260428`, `seed-2-0-pro-260328`, `seed-2-0-lite-260228`, `seed-2-0-mini-260215`, `seed-2-0-code-preview-260328`, `seed-1-8-251228`, `seed-1-6-250915`, `seed-1-6-250615`, `seed-1-6-flash-250715`, `seed-1-6-flash-250615`, `glm-5-2-260617`, `glm-4-7-251222`, `deepseek-v4-pro-260425`, `deepseek-v4-flash-260425`, `deepseek-v3-2-251201`, `gpt-oss-120b-250805` |
| Video | `byteplusVideo` | `dreamina-seedance-2-5-260628`, `dreamina-seedance-2-0-260128`, `dreamina-seedance-2-0-fast-260128`, `dreamina-seedance-2-0-mini-260615`, `seedance-1-5-pro-251215`, `seedance-1-0-pro-250528`, `seedance-1-0-pro-fast-251015` |
| Images | `byteplusImage` | `dola-seedream-5-0-pro-260628`, `seedream-5-0-260128`, `seedream-5-0-lite-260128`, `seedream-4-5-251128`, `seedream-4-0-250828` |
| Speech | `byteplusSpeech` | `seed-audio-1.0` |
| Transcription | `byteplusTranscription` | `seed-asr` |

BytePlus retires model ids often, and its published lists contain ids that do not work. This package lists only dated ids that answered a live request.

`adapter.inputModalities` lists the input kinds of the selected model. See [Check what a model accepts](../advanced/extend-adapter#check-what-a-model-accepts).

## Advanced

These topics are on [BytePlus: Advanced](./byteplus-advanced):

- Regions, and the two BYOK providers.
- Reasoning, `encrypted_content`, and structured output.
- Seedance from the client, the options of each model, and Seedance 2.5.
- Seedream reference images, Seed Speech details, and transcription options.
- The API reference.
