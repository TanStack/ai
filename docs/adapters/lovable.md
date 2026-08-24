---
title: Lovable AI Gateway
id: lovable-adapter
description: "Use one Lovable API key to call Google and OpenAI models through Lovable AI Gateway. Chat, embeddings, image, video, speech, and transcription all work with @tanstack/ai-lovable."
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

Install `@tanstack/ai-lovable`. Then call `lovableText` with a model id such as `google/gemini-3.7-flash`.

Lovable AI Gateway sits in front of Google and OpenAI models. You use one project key. You do not set up a provider account.

## Installation

```bash
npm install @tanstack/ai-lovable
```

## Auth

Set `LOVABLE_API_KEY`. Lovable creates this key for each Cloud project.

```bash
export LOVABLE_API_KEY="..."
```

You can also pass the key to a `create*` factory:

```typescript
import { createLovableText } from "@tanstack/ai-lovable"

const adapter = createLovableText(
  "google/gemini-3.7-flash",
  process.env.LOVABLE_API_KEY!,
)
```

The adapter sends `Authorization: Bearer`, `Lovable-API-Key`, and `X-Lovable-AIG-SDK: tanstack-ai`. Calls go to `https://ai.gateway.lovable.dev/v1`.

## Chat

The default adapter uses the OpenAI Responses API. Model ids use the `google/` or `openai/` form.

**Server.** An endpoint that streams the reply over SSE:

```typescript
import { chat, toServerSentEventsResponse } from "@tanstack/ai"
import { lovableText } from "@tanstack/ai-lovable"

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: lovableText("google/gemini-3.7-flash"),
    messages,
  })

  return toServerSentEventsResponse(stream)
}
```

**Client.** The same `useChat` hook as every other provider:

```tsx
import { useState } from "react"
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react"

export function Chat() {
  const [input, setInput] = useState("")

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}</strong>
          {message.parts.map((part, index) =>
            part.type === "text" ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!input.trim() || isLoading) return
          sendMessage(input)
          setInput("")
        }}
      >
        <input value={input} onChange={(event) => setInput(event.target.value)} />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  )
}
```

## Chat Completions

Pass `{ api: "chat" }` when the model must talk to Chat Completions. The default is Responses.

```typescript
import { chat } from "@tanstack/ai"
import { lovableText } from "@tanstack/ai-lovable"

const stream = chat({
  adapter: lovableText("openai/gpt-5.5", { api: "chat" }),
  messages: [{ role: "user", content: "Hello" }],
})
```

`api: "responses"` is the same as the default. `api: "chat-completions"` is the same as `api: "chat"`.

## Summarize

```typescript
import { summarize } from "@tanstack/ai"
import { lovableSummarize } from "@tanstack/ai-lovable"

const result = await summarize({
  adapter: lovableSummarize("google/gemini-3.7-flash"),
  text: "The Fender Stratocaster is a versatile electric guitar.",
})
```

## Images

Generate a new image, or pass image parts to edit one. OpenAI image models also accept a mask part (`metadata.role === "mask"`).

```typescript
import { generateImage } from "@tanstack/ai"
import { lovableImage } from "@tanstack/ai-lovable"

const result = await generateImage({
  adapter: lovableImage("openai/gpt-image-2"),
  prompt: "a red guitar on a wooden bench",
})
```

## Video

Video jobs are async. Create a job, poll status, then fetch the MP4 URL. Clips last 4, 6, or 8 seconds. 1080p and 4K clips are always 8 seconds. 4K works only on `google/veo-3.1-fast` and `google/veo-3.1`.

```typescript
import { generateVideo } from "@tanstack/ai"
import { lovableVideo } from "@tanstack/ai-lovable"

const { jobId } = await generateVideo({
  adapter: lovableVideo("google/veo-3.1-lite"),
  prompt: "a red guitar on a wooden bench, slow camera push-in",
  duration: 4,
  size: "1280x720",
})
```

Then poll `getVideoJobStatus` with that `jobId`. When the job is complete, the result includes the MP4 URL.

Pass one image part in `prompt` to animate a still frame.

## Embeddings

```typescript
import { embed } from "@tanstack/ai"
import { lovableEmbedding } from "@tanstack/ai-lovable"

const result = await embed({
  adapter: lovableEmbedding("google/gemini-embedding-2"),
  input: "a red guitar",
})

console.log(result.embeddings[0]?.vector)
```

## Speech

```typescript
import { generateSpeech } from "@tanstack/ai"
import { lovableSpeech } from "@tanstack/ai-lovable"

const result = await generateSpeech({
  adapter: lovableSpeech("openai/gpt-4o-mini-tts"),
  text: "Welcome to the guitar shop.",
  voice: "nova",
})
```

## Transcription

```typescript
import { generateTranscription } from "@tanstack/ai"
import { lovableTranscription } from "@tanstack/ai-lovable"

const audio = await fetch("/voice-note.mp3").then((response) => response.blob())

const result = await generateTranscription({
  adapter: lovableTranscription("openai/gpt-4o-mini-transcribe"),
  audio,
  language: "en",
})

console.log(result.text)
```

## Bring Your Own Key

Users can paste a Lovable project key in the browser. Import `lovableByok` from `@tanstack/ai-lovable/byok`, not from the package main entry.

```typescript
import { createLovableText } from "@tanstack/ai-lovable"
import { lovableByok } from "@tanstack/ai-lovable/byok"
import { byokMissing, getByokKey } from "@tanstack/ai/byok/server"

export async function POST(request: Request) {
  const apiKey = getByokKey(request, lovableByok)
  if (!apiKey) return byokMissing(lovableByok)

  const adapter = createLovableText("google/gemini-3.7-flash", apiKey)
  // ...
}
```

See [Bring Your Own Key](../advanced/byok) for the client store and a save UI.

## Models

Pass any model id the gateway accepts. Curated ids get type metadata.

Chat:

- Default: `google/gemini-3.7-flash`
- Fast OpenAI: `openai/gpt-5.5`

Image, video, embeddings, and speech:

- Image default: `openai/gpt-image-2`
- Video default: `google/veo-3.1-lite`
- Embedding default: `google/gemini-embedding-2`
- Speech default: `openai/gpt-4o-mini-tts`
- Transcription default: `openai/gpt-4o-mini-transcribe`

The curated lists are `LOVABLE_CHAT_MODELS`, `LOVABLE_IMAGE_MODELS`, `LOVABLE_VIDEO_MODELS`, `LOVABLE_EMBEDDING_MODELS`, `LOVABLE_TTS_MODELS`, and `LOVABLE_TRANSCRIPTION_MODELS`.

## Errors

- `429 Too Many Requests`: the workspace hit its request-per-minute limit.
- `402 Payment Required`: the workspace is out of credits.

See [Lovable AI features](https://docs.lovable.dev/features/ai) for models, credits, and rate limits.
