---
title: Generation Hooks
id: generation-hooks
order: 7
description: "Framework hooks for TanStack AI image, audio, speech, transcription, summarization, and video generation."
keywords:
  - tanstack ai
  - generation hooks
  - useGenerateImage
  - useGenerateAudio
  - useGenerateSpeech
  - useTranscription
  - useSummarize
  - useGenerateVideo
---

# Generation Hooks

Generation hooks connect a client UI to a generation endpoint and manage
loading, result, error, progress, cancellation, and lightweight persisted state.

| Hook | Input | Result |
| --- | --- | --- |
| `useGenerateImage` | `ImageGenerateInput` | `ImageGenerationResult` |
| `useGenerateAudio` | `AudioGenerateInput` | `AudioGenerationResult` |
| `useGenerateSpeech` | `SpeechGenerateInput` | `TTSResult` |
| `useTranscription` | `TranscriptionGenerateInput` | `TranscriptionResult` |
| `useSummarize` | `SummarizeGenerateInput` | `SummarizationResult` |
| `useGenerateVideo` | `VideoGenerateInput` | `VideoGenerateResult` |
| `useGeneration` | custom `TInput` | custom `TResult` |

Pass exactly one `connection` or `fetcher`.

## Server endpoint

```ts
// app/api/generate/image/route.ts
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { input, threadId, runId } =
    await generationParamsFromRequest('image', request)

  if (typeof input.prompt !== 'string') {
    throw new Error('This endpoint accepts text prompts only.')
  }

  const stream = generateImage({
    ...(threadId ? { threadId } : {}),
    ...(runId ? { runId } : {}),
    adapter: openaiImage('gpt-image-2'),
    prompt: input.prompt,
    stream: true,
  })

  return toServerSentEventsResponse(stream)
}
```

Use the matching generation helper and request kind for other media. Validate
app routing data before passing it into provider options.

## Image generation

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'

export function ImageGenerator() {
  const [prompt, setPrompt] = useState('')
  const image = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
  })

  return (
    <section>
      <input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />
      <button
        disabled={image.isLoading || !prompt.trim()}
        onClick={() => void image.generate({ prompt })}
      >
        Generate
      </button>
      <button disabled={!image.isLoading} onClick={image.stop}>
        Stop
      </button>

      {image.error ? <p>{image.error.message}</p> : null}
      {image.result?.images.map((item, index) => (
        <img
          key={item.url ?? index}
          src={item.url ?? `data:image/png;base64,${item.b64Json}`}
          alt={item.revisedPrompt ?? 'Generated image'}
        />
      ))}
    </section>
  )
}
```

## Speech generation

```tsx
import { fetchServerSentEvents, useGenerateSpeech } from '@tanstack/ai-react'

export function SpeechGenerator() {
  const speech = useGenerateSpeech({
    connection: fetchServerSentEvents('/api/generate/speech'),
  })

  return (
    <section>
      <button
        disabled={speech.isLoading}
        onClick={() =>
          void speech.generate({ text: 'Welcome', voice: 'alloy' })
        }
      >
        Generate speech
      </button>
      {speech.result ? (
        <audio
          controls
          src={`data:audio/${speech.result.format};base64,${speech.result.audio}`}
        />
      ) : null}
    </section>
  )
}
```

## Transcription

```tsx
import { fetchServerSentEvents, useTranscription } from '@tanstack/ai-react'

export function Transcriber({ audio }: { audio: string }) {
  const transcription = useTranscription({
    connection: fetchServerSentEvents('/api/generate/transcription'),
  })

  return (
    <section>
      <button
        disabled={transcription.isLoading}
        onClick={() => void transcription.generate({ audio })}
      >
        Transcribe
      </button>
      <p>{transcription.result?.text}</p>
    </section>
  )
}
```

## Summarization and video

The hooks keep the same control shape:

```tsx
import {
  fetchServerSentEvents,
  useGenerateVideo,
  useSummarize,
} from '@tanstack/ai-react'

export function MediaActions() {
  const summary = useSummarize({
    connection: fetchServerSentEvents('/api/generate/summary'),
  })
  const video = useGenerateVideo({
    connection: fetchServerSentEvents('/api/generate/video'),
  })

  return (
    <div>
      <button
        onClick={() =>
          void summary.generate({ text: 'Long text to summarize...' })
        }
      >
        Summarize
      </button>
      <button
        onClick={() => void video.generate({ prompt: 'A city flyover' })}
      >
        Generate video
      </button>
    </div>
  )
}
```

Video generation may report job and progress events before a final result. The
hook normalizes those events into the same status/error/result controls.

## Shared return values

All generation hooks expose:

| Value | Meaning |
| --- | --- |
| `generate(input)` | Start an explicit generation request. |
| `result` | Latest completed result or `null`. |
| `isLoading` / `status` | Current client state. |
| `error` | Latest error. |
| `stop()` | Abort the current client connection. |
| `reset()` | Clear local result and error state. |
| `resumeSnapshot` | Lightweight observed run snapshot. |
| `resumeState` | Observed `{ threadId, runId }` or `null`. |
| `pendingArtifacts` | Artifact refs observed before completion. |
| `resultArtifacts` | Artifact refs attached to the completed result. |

`stop()` does not delete server state. Whether it stops provider work depends
on whether the endpoint forwards and honors the abort signal.

## Persist the lightweight snapshot

```tsx
import { localStoragePersistence } from '@tanstack/ai-client'
import { fetchServerSentEvents, useGenerateVideo } from '@tanstack/ai-react'
import type { GenerationResumeSnapshot } from '@tanstack/ai-client'

function serializeJson(value: unknown): string {
  const stringify: (input: unknown) => unknown = JSON.stringify
  const serialized = stringify(value)
  if (typeof serialized !== 'string') {
    throw new TypeError('The value is not JSON serializable.')
  }
  return serialized
}

const snapshots = localStoragePersistence<GenerationResumeSnapshot>({
  keyPrefix: 'my-app:generation:',
  serialize: serializeJson,
  deserialize: JSON.parse,
})

export function TrailerGenerator() {
  const video = useGenerateVideo({
    id: 'trailer-video',
    connection: fetchServerSentEvents('/api/generate/video'),
    persistence: { server: snapshots },
  })

  return (
    <section>
      <button
        disabled={video.isLoading}
        onClick={() => void video.generate({ prompt: 'A city flyover' })}
      >
        Generate
      </button>
      {video.resultArtifacts.map((artifact) => (
        <a
          key={artifact.artifactId}
          href={`/api/artifacts/${artifact.artifactId}`}
        >
          {artifact.name}
        </a>
      ))}
    </section>
  )
}
```

The snapshot contains no delivery offset, does not store media bytes, and does
not auto-resume a run. Persist bytes on the server with
`withGenerationPersistence(...)`; see
[Generation Persistence](../persistence/generation-persistence).

## Framework variants

React, Vue, Svelte, Solid, and Angular expose the same capabilities with their
native reactive conventions. React return values are plain values and
functions; Vue uses refs, Svelte uses reactive getters, and Solid/Angular use
accessors or signals.

## Next steps

- [Image Generation](./image-generation)
- [Text-to-Speech](./text-to-speech)
- [Transcription](./transcription)
- [Video Generation](./video-generation)
- [Generation Persistence](../persistence/generation-persistence)
