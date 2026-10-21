---
title: Lovable AI Gateway
id: lovable-adapter
description: "Call Google and OpenAI models with one Lovable project key through Lovable AI Gateway and @tanstack/ai-lovable: chat, images, video, embeddings, speech, and transcription."
keywords:
  - tanstack ai
  - lovable
  - ai gateway
  - adapter
  - chat
  - responses
  - embeddings
  - image generation
  - video generation
  - tts
  - transcription
---

Lovable AI Gateway gives you Google and OpenAI models with one project key. You do not need an account with each provider. The adapter covers chat, images, video, embeddings, speech, and transcription.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-lovable
vue: @tanstack/ai-lovable
solid: @tanstack/ai-lovable
svelte: @tanstack/ai-lovable
preact: @tanstack/ai-lovable
angular: @tanstack/ai-lovable
vanilla: @tanstack/ai-lovable
octane: @tanstack/ai-lovable

<!-- ::end:tabs -->

## 2. Set the API key

Lovable creates a `LOVABLE_API_KEY` for each Cloud project. Put it in the environment of your server:

```bash
LOVABLE_API_KEY=your-lovable-key
```

`lovableText` and the other short factories read `LOVABLE_API_KEY`. To pass the key in code, use the `create*` factory of the same adapter:

```typescript
import { createLovableText } from "@tanstack/ai-lovable";

const adapter = createLovableText("google/gemini-3.7-flash", process.env.LOVABLE_API_KEY!);
```

## 3. Stream a chat from the server

Model ids use the `google/` or `openai/` form:

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { lovableText } from "@tanstack/ai-lovable";

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: lovableText("google/gemini-3.7-flash"),
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

You now have a streaming chat on Lovable. To use an OpenAI model, change the id, for example to `openai/gpt-5.6-sol`.

## Images

Make a new image from a prompt:

```typescript
import { generateImage } from "@tanstack/ai";
import { lovableImage } from "@tanstack/ai-lovable";

const result = await generateImage({
  adapter: lovableImage("openai/gpt-image-2"),
  prompt: "a red guitar on a wooden bench",
});
```

To edit an image, pass image parts. OpenAI image models also take a mask part (`metadata.role === "mask"`). See [Image Generation](../media/image-generation).

## Video

> [!NOTE]
> Video generation is an [experimental feature](../media/video-generation).

Video runs as a job. `generateVideo()` starts the job and returns a `jobId`. Poll the job until it has an MP4 URL:

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { lovableVideo } from "@tanstack/ai-lovable";

const adapter = lovableVideo("google/veo-3.1-lite");

const { jobId } = await generateVideo({
  adapter,
  prompt: "a red guitar on a wooden bench, slow camera push-in",
  duration: "4s",
  size: "1280x720",
});

let status = await getVideoJobStatus({ adapter, jobId });
while (status.status === "pending" || status.status === "processing") {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  status = await getVideoJobStatus({ adapter, jobId });
}

console.log(status.status === "completed" ? status.url : status.error);
```

- A clip is 4, 6, or 8 seconds. You can write `4`, `"4"`, or `"4s"`. The same forms work for 6 and 8.
- 1080p and 4K clips are always 8 seconds.
- 4K works only on `google/veo-3.1-fast` and `google/veo-3.1`.
- To animate a still frame, pass one image part in `prompt`.

## Embeddings

```typescript
import { embed } from "@tanstack/ai";
import { lovableEmbedding } from "@tanstack/ai-lovable";

const result = await embed({
  adapter: lovableEmbedding("google/gemini-embedding-2"),
  input: "a red guitar",
});

console.log(result.embeddings[0]?.vector);
```

## Speech

```typescript
import { generateSpeech } from "@tanstack/ai";
import { lovableSpeech } from "@tanstack/ai-lovable";

const result = await generateSpeech({
  adapter: lovableSpeech("openai/gpt-4o-mini-tts"),
  text: "Welcome to the guitar shop.",
  voice: "nova",
});
```

See [Text-to-Speech](../media/text-to-speech).

## Transcription

`audio` takes a `File`, a `Blob`, an `ArrayBuffer`, a base64 string, or a data URL:

```typescript
import { generateTranscription } from "@tanstack/ai";
import { lovableTranscription } from "@tanstack/ai-lovable";

const audio = await fetch("https://example.com/voice-note.mp3").then((response) =>
  response.blob(),
);

const result = await generateTranscription({
  adapter: lovableTranscription("openai/gpt-4o-mini-transcribe"),
  audio,
  language: "en",
});

console.log(result.text);
```

See [Transcription](../media/transcription).

## Summarization

```typescript
import { summarize } from "@tanstack/ai";
import { lovableSummarize } from "@tanstack/ai-lovable";

const result = await summarize({
  adapter: lovableSummarize("google/gemini-3.7-flash"),
  text: "The Fender Stratocaster is a versatile electric guitar.",
});
```

## Models and options

### Reasoning

Set `reasoning` on `chat()`. The types take the levels of each model:

```typescript
import { chat } from "@tanstack/ai";
import { lovableText } from "@tanstack/ai-lovable";

const stream = chat({
  adapter: lovableText("openai/gpt-5.6-sol"),
  messages: [{ role: "user", content: "Plan a database migration." }],
  reasoning: "xhigh",
});
```

- Responses (the default) sends `reasoning.effort`. Chat Completions sends `reasoning_effort`.
- Neither takes `budgetTokens`.
- The OpenAI and Gemini models take the same levels as on [OpenAI](./openai#reasoning) and [Gemini](./gemini#reasoning).

### Models

Pass a model id from the curated lists. TypeScript rejects an id that is not on a list.

| Activity | Default model | List |
| --- | --- | --- |
| Chat | `google/gemini-3.7-flash` | `LOVABLE_CHAT_MODELS` |
| Images | `openai/gpt-image-2` | `LOVABLE_IMAGE_MODELS` |
| Video | `google/veo-3.1-lite` | `LOVABLE_VIDEO_MODELS` |
| Embeddings | `google/gemini-embedding-2` | `LOVABLE_EMBEDDING_MODELS` |
| Speech | `openai/gpt-4o-mini-tts` | `LOVABLE_TTS_MODELS` |
| Transcription | `openai/gpt-4o-mini-transcribe` | `LOVABLE_TRANSCRIPTION_MODELS` |

For chat, `openai/gpt-5.5` is a fast OpenAI choice.

## Advanced

### Chat Completions

The default text adapter uses the OpenAI Responses API. If a model must use Chat Completions, pass `{ api: "chat" }`:

```typescript
import { chat } from "@tanstack/ai";
import { lovableText } from "@tanstack/ai-lovable";

const stream = chat({
  adapter: lovableText("openai/gpt-5.5", { api: "chat" }),
  messages: [{ role: "user", content: "Hello" }],
});
```

- `api: "responses"` is the same as the default.
- `api: "chat-completions"` is the same as `api: "chat"`.

Need a header on each request, or a log of each model call? The chat adapters on this page support [`wrapFetch`](../advanced/middleware#change-the-http-requests-of-a-call).

### Bring Your Own Key

Users can paste a Lovable project key in the browser. Import `lovableByok` from `@tanstack/ai-lovable/byok`. The package main entry does not export it.

```typescript
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server";
import { createLovableText } from "@tanstack/ai-lovable";
import { lovableByok } from "@tanstack/ai-lovable/byok";

export async function POST(request: Request) {
  const apiKey = getByokKey(request, lovableByok);
  if (!apiKey) return byokMissing(lovableByok);

  const { messages, threadId, runId } = await chatParamsFromRequest(request);

  const stream = chat({
    adapter: createLovableText("google/gemini-3.7-flash", apiKey),
    messages,
    threadId,
    runId,
  });

  return toServerSentEventsResponse(stream);
}
```

See [Bring Your Own Key](../advanced/byok) for the client store and a save UI.

### Requests

- Calls go to `https://ai.gateway.lovable.dev/v1`.
- The adapter sends `Authorization: Bearer`, `Lovable-API-Key`, and `X-Lovable-AIG-SDK: tanstack-ai`.

### Errors

- `429 Too Many Requests`: the workspace hit its limit of requests per minute.
- `402 Payment Required`: the workspace has no credits left.

See [Lovable AI features](https://docs.lovable.dev/features/ai) for models, credits, and rate limits.
