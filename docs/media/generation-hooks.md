---
title: Generation Hooks
id: generation-hooks
order: 7
description: "Client hooks for every media generation: image, audio, speech, transcription, summarization, and video. One shape for loading, errors, and results in every framework."
keywords:
  - tanstack ai
  - generation hooks
  - useGenerateImage
  - useGenerateAudio
  - useGenerateSpeech
  - useTranscription
  - useSummarize
  - useGenerateVideo
  - react hooks
---

A generation hook tracks the request, the loading state, the error, and the result for one media call.

## Quick setup

This connects a React component to an image route. It takes about 5 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai

<!-- ::end:tabs -->

2. Add a `POST` route at `/api/generate/image`. It reads `OPENAI_API_KEY` from the environment:

```typescript
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { input, threadId } = await generationParamsFromRequest('image', request)
  if (typeof input.prompt !== 'string') {
    return new Response('Send a text prompt.', { status: 400 })
  }

  const stream = generateImage({
    adapter: openaiImage('gpt-image-2.5-flare'),
    prompt: input.prompt,
    threadId,
    size: '1024x1024',
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}
```

3. Add the hook to a component:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'

export function ImageGenerator() {
  const [prompt, setPrompt] = useState('')
  const { generate, result, isLoading, error, reset } = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
    threadId: 'image-studio',
  })

  return (
    <div>
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe an image..."
      />
      <button
        onClick={() => generate({ prompt })}
        disabled={isLoading || !prompt.trim()}
      >
        {isLoading ? 'Generating...' : 'Generate'}
      </button>

      {error && <p role="alert">Error: {error.message}</p>}

      {result?.images.map((img, i) => (
        <img
          key={i}
          src={img.url || `data:image/png;base64,${img.b64Json}`}
          alt={img.revisedPrompt || 'Generated image'}
        />
      ))}

      {result && <button onClick={reset}>Clear</button>}
    </div>
  )
}
```

Type a prompt and click **Generate**. The button shows the loading state, then the image appears. **Clear** resets the hook.

## How it works

Every generation hook does the same job:

1. `generate(input)` sends the input to your server.
2. While the server works, `isLoading` is `true` and `status` is `'generating'`.
3. When the result arrives, the hook stores it on `result`. If the server fails, the hook stores the failure on `error`.

You give the hook one transport:

- `connection`: a streaming transport, such as `fetchServerSentEvents('/api/...')`. Use it with an API route.
- `fetcher`: an async function, such as a TanStack Start server function. It can return the result, or an SSE `Response`.

The server half and the three transports are explained in [Generations](./generations).

| Hook | Input | Result |
| --- | --- | --- |
| `useGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `useGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `useGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `useTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `useSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `useGenerateVideo` | `VideoGenerateInput` | `VideoGenerateResult` |
| `useGeneration` | Your own `TInput` | Your own `TResult` |

Every hook returns `generate`, `result`, `isLoading`, `error`, `status`, `stop`, `reset`, and `runId`. The full tables are in [Options](#options) and [Return value](#return-value).

## Hooks by media type

Each section lists what `generate()` accepts. The linked guide shows the server route and the provider options.

### useGenerateImage

Makes one or more images. Guide: [Image Generation](./image-generation).

| Field | Type | Description |
| --- | --- | --- |
| `prompt` | `string \| MediaPromptPart[]` | What to draw (required). An array of text and image parts works on models that take reference images. |
| `numberOfImages` | `number` | How many images to make |
| `size` | `string` | Image size, for example `"1024x1024"` |
| `modelOptions` | `Record<string, any>` | Model-specific options |

### useGenerateAudio

Makes music or sound effects from a prompt. Guide: [Audio Generation](./audio-generation).

| Field | Type | Description |
| --- | --- | --- |
| `prompt` | `string` | What the audio sounds like (required) |
| `duration` | `number` | Length in seconds |
| `modelOptions` | `Record<string, any>` | Model-specific options |

This example also shows a `fetcher` with Bring Your Own Key (BYOK). The user's key goes in `x-byok-*` headers. With a `fetcher`, spread `headers` from the second argument onto your request so the keys reach the server:

```tsx
import { useGenerateAudio } from '@tanstack/ai-react'
import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'

const byok = defineByok({ storage: defaultByokStorage() })
const threadId = 'audio'

export function AudioGenerator() {
  const { generate, result, isLoading, error } = useGenerateAudio({
    byok,
    byokProvider: () => 'fal',
    fetcher: (input, { threadId, signal, headers }) =>
      fetch('/api/generate/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ ...input, threadId }),
        signal,
      }),
    threadId,
  })

  return (
    <div>
      <button
        onClick={() => generate({ prompt: 'An upbeat electronic track' })}
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate'}
      </button>
      {error && <p role="alert">Error: {error.message}</p>}
      {result?.audio.url && <audio src={result.audio.url} controls />}
    </div>
  )
}
```

On the server, read the key from the header, then run `generateAudio`:

```typescript
import { generateAudio, toServerSentEventsResponse } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST(request: Request) {
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)

  const body: unknown = await request.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('prompt' in body) ||
    !('threadId' in body)
  ) {
    return new Response('Bad request', { status: 400 })
  }
  const { prompt, threadId } = body
  if (typeof prompt !== 'string' || typeof threadId !== 'string') {
    return new Response('Bad request', { status: 400 })
  }

  const stream = generateAudio({
    adapter: falAudio('fal-ai/minimax-music/v2.6', { apiKey }),
    prompt,
    threadId,
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}
```

The fetcher posts the input and the `threadId`, so this route reads `prompt` and `threadId` from the top of the body. For `defineByok` and a UI to save keys, see [Bring Your Own Key](../advanced/byok).

### useGenerateSpeech

Turns text into spoken audio. Guide: [Text-to-Speech](./text-to-speech).

| Field | Type | Description |
| --- | --- | --- |
| `text` | `string` | The text to speak. Leave it out when you send `turns`. |
| `turns` | `Array<TTSTurn>` | Dialogue turns with more than one voice. Only for adapters that support more than one speaker. |
| `timestamps` | `boolean` | Ask for `alignment` and `segments` on the result. Only for adapters that support timestamps. |
| `voice` | `string` | The voice, for example `"alloy"` |
| `format` | `'mp3' \| 'opus' \| 'aac' \| 'flac' \| 'wav' \| 'pcm'` | Output audio format |
| `speed` | `number` | Speed, from 0.25 to 4.0 |
| `modelOptions` | `Record<string, any>` | Model-specific options |

`TTSResult` holds `audio` (base64) and `format`. It can also hold `duration`, `contentType`, `alignment`, and `segments`. To play it:

```tsx
import { fetchServerSentEvents, useGenerateSpeech } from '@tanstack/ai-react'

export function SpeechPlayer() {
  const { generate, result, isLoading } = useGenerateSpeech({
    connection: fetchServerSentEvents('/api/generate/speech'),
    threadId: 'speech',
  })

  return (
    <div>
      <button
        onClick={() => generate({ text: 'Hello from TanStack AI!', voice: 'alloy' })}
        disabled={isLoading}
      >
        Speak
      </button>
      {result && (
        <audio
          src={`data:audio/${result.format};base64,${result.audio}`}
          controls
          autoPlay
        />
      )}
    </div>
  )
}
```

### useTranscription

Turns recorded audio into text. Guide: [Transcription](./transcription).

| Field | Type | Description |
| --- | --- | --- |
| `audio` | `string \| File \| Blob \| ArrayBuffer` | The audio (required). Over a `connection`, send a base64 string or a data URL. |
| `language` | `string` | Language in ISO-639-1 format, for example `"en"` |
| `prompt` | `string` | A hint that guides the transcription |
| `responseFormat` | `'json' \| 'text' \| 'srt' \| 'verbose_json' \| 'vtt'` | Output format |
| `modelOptions` | `Record<string, any>` | Model-specific options |

`TranscriptionResult` holds `text`. It can also hold `language`, `duration`, `segments`, and `words`.

### useSummarize

Makes a summary of long text. There is no separate guide, so the full example is here.

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useSummarize } from '@tanstack/ai-react'

export function Summarizer() {
  const [text, setText] = useState('')
  const { generate, result, isLoading, error } = useSummarize({
    connection: fetchServerSentEvents('/api/summarize'),
    threadId: 'summary',
  })

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste text to summarize..."
        rows={8}
      />
      <button
        onClick={() => generate({ text, style: 'bullet-points', maxLength: 200 })}
        disabled={isLoading || !text.trim()}
      >
        {isLoading ? 'Summarizing...' : 'Summarize'}
      </button>
      {error && <p role="alert">Error: {error.message}</p>}
      {result && <p>{result.summary}</p>}
    </div>
  )
}
```

| Field | Type | Description |
| --- | --- | --- |
| `text` | `string` | The text to summarize (required) |
| `maxLength` | `number` | Maximum length of the summary |
| `style` | `'bullet-points' \| 'paragraph' \| 'concise'` | Summary style |
| `focus` | `Array<string>` | Topics to focus on |
| `modelOptions` | `Record<string, any>` | Model-specific options |

On the server, call `summarize()` with `stream: true` and return `toServerSentEventsResponse()`. `generationParamsFromRequest` has no `summarize` kind, so read the envelope yourself. The hook sends its input in `forwardedProps`, and `threadId` and `runId` at the top of the body:

```typescript
import { summarize, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const body: unknown = await request.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('threadId' in body) ||
    !('forwardedProps' in body)
  ) {
    return new Response('Bad request', { status: 400 })
  }
  const { threadId, forwardedProps } = body
  if (
    typeof threadId !== 'string' ||
    typeof forwardedProps !== 'object' ||
    forwardedProps === null ||
    !('text' in forwardedProps) ||
    typeof forwardedProps.text !== 'string'
  ) {
    return new Response('Bad request', { status: 400 })
  }
  const runId =
    'runId' in body && typeof body.runId === 'string' ? body.runId : undefined

  const stream = summarize({
    adapter: openaiSummarize('gpt-5.5'),
    text: forwardedProps.text,
    style: 'bullet-points',
    maxLength: 200,
    threadId,
    runId,
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}
```

### useGenerateVideo

Makes a video. A video runs as a job: the server starts it, then polls the provider until it is done. Guide: [Video Generation](./video-generation).

| Field | Type | Description |
| --- | --- | --- |
| `prompt` | `string \| MediaPromptPart[]` | What the video shows (required). An array of text and image parts works on models that take a start frame or references. |
| `size` | `string` | Video size. The format depends on the provider, for example `"16:9"` or `"1280x720"`. |
| `duration` | `number` | Length in seconds |
| `modelOptions` | `Record<string, any>` | Model-specific options |

`useGenerateVideo` returns two more values, so you can show progress:

| Property | Type | Description |
| --- | --- | --- |
| `jobId` | `string \| null` | The job id. Set when the server creates the job. |
| `videoStatus` | `VideoStatusInfo \| null` | The last status update: `status`, `progress`, and `jobId` |

```typescript
interface VideoStatusInfo {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number // 0-100
  url?: string // set when completed
  error?: string // set when failed
}
```

It also takes two more callbacks: `onJobCreated(jobId)` and `onStatusUpdate(status)`.

## Framework variants

Every framework has the same hooks with the same options. Only the names and the reactive values change.

| Generation | React, Vue, Solid, Octane | Svelte, Remix | Angular |
| --- | --- | --- | --- |
| Image | `useGenerateImage` | `createGenerateImage` | `injectGenerateImage` |
| Audio | `useGenerateAudio` | `createGenerateAudio` | `injectGenerateAudio` |
| Speech | `useGenerateSpeech` | `createGenerateSpeech` | `injectGenerateSpeech` |
| Transcription | `useTranscription` | `createTranscription` | `injectTranscription` |
| Summarization | `useSummarize` | `createSummarize` | `injectSummarize` |
| Video | `useGenerateVideo` | `createGenerateVideo` | `injectGenerateVideo` |
| Base (custom) | `useGeneration` | `createGeneration` | `injectGeneration` |

How to read the values in each framework:

- **Vue** (`@tanstack/ai-vue`): values are `DeepReadonly<ShallowRef<>>`. Read them with `.value` in `<script>` and in `<template>`.
- **Solid** (`@tanstack/ai-solid`): values are accessors. Call them, for example `result()`.
- **Svelte** (`@tanstack/ai-svelte`): values are Svelte 5 `$state`.
- **Angular** (`@tanstack/ai-angular`): values are read-only signals. Call them, for example `result()`.
- **Remix** (`@tanstack/ai-remix`): pass the component `handle` as the first argument, for example `createGenerateImage(handle, options)`.

Every package re-exports `fetchServerSentEvents` and `fetchHttpStream` from `@tanstack/ai-client`. For full samples, see the API pages for [Vue](../api/ai-vue), [Solid](../api/ai-solid), [Svelte](../api/ai-svelte), [Angular](../api/ai-angular), [Octane](../api/ai-octane), and [Remix](../api/ai-remix).

## Advanced

### Options

Every hook takes these options:

| Option | Type | Description |
| --- | --- | --- |
| `connection` | `ConnectConnectionAdapter` | Streaming transport (SSE, HTTP stream, or custom) |
| `fetcher` | `(input, options) => Promise<Result \| Response>` | An async function, or a server function that returns an SSE `Response`. `options` holds `signal`, `threadId`, `runId`, and `headers`. |
| `body` | `Record<string, any>` | Extra fields sent with each `connection` request |
| `threadId` | `string` | Required. A stable name for this generation slot. |
| `persistence` | `boolean` | `true` restores the last run for `threadId` from the server when the component mounts |
| `onResult` | `(result) => TOutput \| null \| void` | React to the result, or change what is stored. See [Result transforms](#result-transforms). |
| `onError` | `(error: Error) => void` | Called when the run fails |
| `onProgress` | `(progress: number, message?: string) => void` | Progress updates, from 0 to 100 |

Options for special cases:

| Option | Type | Description |
| --- | --- | --- |
| `byok` | `ByokClient` | A keyring. Keys go in `x-byok-*` headers, never in the body. |
| `byokProvider` | `() => ProviderId \| undefined` | The provider slug. If it returns a slug, only that key is sent. Otherwise the hook uses `body.provider`. If no slug resolves, `generate` throws. |
| `onChunk` | `(chunk: StreamChunk) => void` | Called for each stream event. Only with `connection`. |
| `hydrateGeneration` | handler | Restores the last run when the `connection` has no restore handler, for example next to a `fetcher` |
| `joinRun` | handler | Re-attaches to a run that is still going after a reload. Without it, a restored running run shows as an error. |
| `devtools` | `AIDevtoolsDisplayOptions` | How the run shows in TanStack AI Devtools |

### Return value

| Property | Type | Description |
| --- | --- | --- |
| `generate` | `(input) => Promise<void>` | Start a generation |
| `result` | `TOutput \| null` | The result, after any transform. `null` before the first result. |
| `isLoading` | `boolean` | `true` while a generation runs |
| `error` | `Error \| undefined` | The current error, if any |
| `status` | `GenerationClientState` | `'idle'`, `'generating'`, `'success'`, or `'error'` |
| `stop` | `() => void` | Abort the current generation |
| `reset` | `() => void` | Clear the result and the error, and go back to `'idle'` |
| `runId` | `string \| null` | The id of the run in progress, or `null` |

`stop()` only aborts the local stream. Work that already runs on the provider continues. To cancel or poll that provider job, send `runId` to your own endpoint.

### Result transforms

`onResult` can change what the hook stores on `result`:

- Return a value that is not `null`: the hook stores that value.
- Return `null`: the hook keeps the previous result. Use this to filter results.
- Return nothing: the hook stores the raw result.

TypeScript infers the type of `result` from what `onResult` returns. You do not need a generic parameter.

```tsx
import { fetchServerSentEvents, useGenerateSpeech } from '@tanstack/ai-react'
import type { TTSResult } from '@tanstack/ai'

export function SpeechPlayer() {
  const { result } = useGenerateSpeech({
    connection: fetchServerSentEvents('/api/generate/speech'),
    threadId: 'speech',
    onResult: (raw: TTSResult) => ({
      audioUrl: `data:${raw.contentType};base64,${raw.audio}`,
      duration: raw.duration,
    }),
  })
  // result is { audioUrl: string; duration?: number } | null
}
```

### Keep results after a reload

Every generation hook takes the same `persistence` option that `useChat` takes. With it, the status and the result of a long run come back after a page reload or a dropped connection.

The hook restores by `threadId`. For a generation, `threadId` names the slot that successive runs fill, for example `product-7-hero`. It does not name a conversation. See [Id map](../persistence/id-map). The setup is in [Generation Persistence](../persistence/generation-persistence).

### Custom generations with useGeneration

All the hooks above use `useGeneration` internally. Use it directly for a generation type that has no built-in hook:

```tsx
import { fetchServerSentEvents, useGeneration } from '@tanstack/ai-react'

interface EmbeddingInput {
  text: string
  model?: string
}

interface EmbeddingResult {
  embedding: Array<number>
  model: string
  usage: { totalTokens: number }
}

export function EmbeddingGenerator() {
  const { generate, result, isLoading } = useGeneration<
    EmbeddingInput,
    EmbeddingResult
  >({
    connection: fetchServerSentEvents('/api/generate/embedding'),
    threadId: 'generation',
  })

  return (
    <div>
      <button onClick={() => generate({ text: 'Hello world' })} disabled={isLoading}>
        Generate embedding
      </button>
      {result && <p>Dimensions: {result.embedding.length}</p>}
    </div>
  )
}
```

`useGeneration` takes the same [options](#options) and returns the same [values](#return-value) as the other hooks.
