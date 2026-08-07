---
title: Generation Hooks
id: generation-hooks
order: 7
description: "Client hooks for image, audio, speech, transcription, summarize, and video — loading, error, and result state."
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

# Generation Hooks

If you need client-side media generation → use a generation hook with a server SSE endpoint (or `fetcher`).

Survive reloads with the same `persistence` option as `useChat`. See [Generation Persistence](../persistence/generation-persistence) and [Id map](../persistence/id-map).

## Hook map

| Hook | Input | Result |
|------|-------|--------|
| `useGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `useGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `useGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `useTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `useSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `useGenerateVideo` | `VideoGenerateInput` | `VideoGenerateResult` |
| `useGeneration` | Generic `TInput` | Generic `TResult` |

Every hook returns: `generate`, `result`, `isLoading`, `error`, `status`, `stop`, `reset`, `runId`. Provide `connection` (streaming) or `fetcher` (direct).

## 1. Server endpoint (SSE)

```typescript
// routes/api/generate/image.ts
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export async function POST(req: Request) {
  const { prompt, size, numberOfImages } = await req.json()

  const stream = generateImage({
    adapter: openaiImage('dall-e-3'),
    prompt,
    size,
    numberOfImages,
    stream: true,
  })

  return toServerSentEventsResponse(stream)
}
```

Swap `generateImage` for `generateSpeech`, `generateTranscription`, `summarize`, `generateVideo`, or `generateAudio`. Provider details live in each media guide.

## useGenerateImage

```tsx
import { useGenerateImage, fetchServerSentEvents } from '@tanstack/ai-react'
import { useState } from 'react'

function ImageGenerator() {
  const [prompt, setPrompt] = useState('')
  const { generate, result, isLoading, error, reset } = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
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
      {error && <p>Error: {error.message}</p>}
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

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | Required |
| `numberOfImages` | `number` | How many images |
| `size` | `string` | e.g. `"1024x1024"` |
| `modelOptions` | `Record<string, any>` | Model-specific |

## useGenerateSpeech

```tsx
import { useGenerateSpeech, fetchServerSentEvents } from '@tanstack/ai-react'
import { useRef } from 'react'

function SpeechGenerator() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const { generate, result, isLoading, error } = useGenerateSpeech({
    connection: fetchServerSentEvents('/api/generate/speech'),
  })

  return (
    <div>
      <button
        onClick={() =>
          generate({ text: 'Hello, welcome to TanStack AI!', voice: 'alloy' })
        }
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate Speech'}
      </button>
      {error && <p>Error: {error.message}</p>}
      {result && (
        <audio
          ref={audioRef}
          src={`data:audio/${result.format};base64,${result.audio}`}
          controls
          autoPlay
        />
      )}
    </div>
  )
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Required |
| `voice` | `string` | e.g. `"alloy"`, `"echo"` |
| `format` | `'mp3' \| 'opus' \| 'aac' \| 'flac' \| 'wav' \| 'pcm'` | Output format |
| `speed` | `number` | 0.25–4.0 |
| `modelOptions` | `Record<string, any>` | Model-specific |

`TTSResult`: `audio` (base64), `format`, optional `duration` / `contentType`.

## useTranscription

```tsx
import { useTranscription, fetchServerSentEvents } from '@tanstack/ai-react'

function Transcriber() {
  const { generate, result, isLoading, error } = useTranscription({
    connection: fetchServerSentEvents('/api/transcribe'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const audio = reader.result
      if (typeof audio !== 'string') return
      generate({ audio, language: 'en' })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <input type="file" accept="audio/*" onChange={handleFile} />
      {isLoading && <p>Transcribing...</p>}
      {error && <p>Error: {error.message}</p>}
      {result && (
        <div>
          <h3>Transcription</h3>
          <p>{result.text}</p>
          {result.language && <p>Language: {result.language}</p>}
          {result.duration && <p>Duration: {result.duration}s</p>}
        </div>
      )}
    </div>
  )
}
```

| Field | Type | Description |
|-------|------|-------------|
| `audio` | `string \| File \| Blob \| ArrayBuffer` | Required |
| `language` | `string` | ISO-639-1, e.g. `"en"` |
| `prompt` | `string` | Guide terms/style |
| `responseFormat` | `'json' \| 'text' \| 'srt' \| 'verbose_json' \| 'vtt'` | Output format |
| `modelOptions` | `Record<string, any>` | Model-specific |

## useSummarize

```tsx
import { useSummarize, fetchServerSentEvents } from '@tanstack/ai-react'
import { useState } from 'react'

function Summarizer() {
  const [text, setText] = useState('')
  const { generate, result, isLoading, error } = useSummarize({
    connection: fetchServerSentEvents('/api/summarize'),
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
        onClick={() =>
          generate({ text, style: 'bullet-points', maxLength: 200 })
        }
        disabled={isLoading || !text.trim()}
      >
        {isLoading ? 'Summarizing...' : 'Summarize'}
      </button>
      {error && <p>Error: {error.message}</p>}
      {result && (
        <div>
          <h3>Summary</h3>
          <p>{result.summary}</p>
        </div>
      )}
    </div>
  )
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Required |
| `maxLength` | `number` | Max summary length |
| `style` | `'bullet-points' \| 'paragraph' \| 'concise'` | Style |
| `focus` | `Array<string>` | Topics to emphasize |
| `modelOptions` | `Record<string, any>` | Model-specific |

## useGenerateVideo

Job create + poll on the server. Hook exposes `jobId` and `videoStatus`.

```tsx
import { useGenerateVideo, fetchServerSentEvents } from '@tanstack/ai-react'

function VideoGenerator() {
  const { generate, result, jobId, videoStatus, isLoading, error } =
    useGenerateVideo({
      connection: fetchServerSentEvents('/api/generate/video'),
      onStatusUpdate: (status) => {
        console.log(
          `Video ${status.jobId}: ${status.status} (${status.progress}%)`,
        )
      },
    })

  return (
    <div>
      <button
        onClick={() =>
          generate({ prompt: 'A flying car over a city', duration: 5 })
        }
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate Video'}
      </button>
      {isLoading && videoStatus && (
        <div>
          <p>Job: {jobId}</p>
          <p>Status: {videoStatus.status}</p>
          {videoStatus.progress != null && (
            <progress value={videoStatus.progress} max={100} />
          )}
        </div>
      )}
      {error && <p>Error: {error.message}</p>}
      {result && (
        <video src={result.url} controls autoPlay style={{ maxWidth: '100%' }} />
      )}
    </div>
  )
}
```

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | `string` | Required |
| `size` | `string` | e.g. `"16:9"`, `"1280x720"` |
| `duration` | `number` | Seconds |
| `modelOptions` | `Record<string, any>` | Model-specific |

Extra returns: `jobId`, `videoStatus` (`status`, `progress`, `jobId`). Callbacks: `onJobCreated`, `onStatusUpdate`.

```typescript
interface VideoStatusInfo {
  jobId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
  url?: string
  error?: string
}
```

## Base: useGeneration

Use for custom generation types.

```tsx
import { useGeneration, fetchServerSentEvents } from '@tanstack/ai-react'

interface EmbeddingInput {
  text: string
  model?: string
}

interface EmbeddingResult {
  embedding: Array<number>
  model: string
  usage: { totalTokens: number }
}

function EmbeddingGenerator() {
  const { generate, result, isLoading, error } = useGeneration<
    EmbeddingInput,
    EmbeddingResult
  >({
    connection: fetchServerSentEvents('/api/generate/embedding'),
  })

  return (
    <div>
      <button
        onClick={() => generate({ text: 'Hello world' })}
        disabled={isLoading}
      >
        Generate Embedding
      </button>
      {result && <p>Dimensions: {result.embedding.length}</p>}
    </div>
  )
}
```

### Options / return

| Option | Type | Description |
|--------|------|-------------|
| `connection` | `ConnectConnectionAdapter` | Streaming transport |
| `fetcher` | `GenerationFetcher<TInput, TResult>` | Direct async (no stream) |
| `id` / `body` | string / record | Instance id / extra body |
| `onResult` / `onError` / `onProgress` / `onChunk` | callbacks | Transform, errors, progress, chunks |

| Property | Type | Description |
|----------|------|-------------|
| `generate` | `(input: TInput) => Promise<void>` | Trigger |
| `result` | `TOutput \| null` | Result |
| `isLoading` / `error` / `status` | state | Loading, error, lifecycle |
| `stop` / `reset` | functions | Abort / clear |

### Result transforms

```tsx
import { useGenerateImage, fetchServerSentEvents } from '@tanstack/ai-react'
import type { ImageGenerationResult } from '@tanstack/ai'

const { result } = useGenerateImage({
  connection: fetchServerSentEvents('/api/generate/image'),
  onResult: (raw: ImageGenerationResult) =>
    raw.images.map((img) => img.url || img.b64Json),
})
// result is string[]
```

## Framework variants

| Type | React | Vue | Svelte |
|------|-------|-----|--------|
| Image | `useGenerateImage` | `useGenerateImage` | `createGenerateImage` |
| Speech | `useGenerateSpeech` | `useGenerateSpeech` | `createGenerateSpeech` |
| Transcription | `useTranscription` | `useTranscription` | `createTranscription` |
| Summarize | `useSummarize` | `useSummarize` | `createSummarize` |
| Video | `useGenerateVideo` | `useGenerateVideo` | `createGenerateVideo` |
| Base | `useGeneration` | `useGeneration` | `createGeneration` |

All re-export `fetchServerSentEvents`, `fetchHttpStream`, `stream` from `@tanstack/ai-client`.

Vue: access with `.value`. Svelte: `create*` + `$state`.

## Next

- [Image](./image-generation) · [TTS](./text-to-speech) · [Transcription](./transcription) · [Video](./video-generation)
- [Generations overview](./generations)
