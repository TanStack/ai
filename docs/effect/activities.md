---
title: Effect Activities
id: effect-activities
order: 3
description: "Run TanStack AI image, audio, speech, embedding, and other activities as Effects or Streams with @tanstack/ai-effect. Handle AIError with catchTag and stop requests with interruption."
keywords:
  - tanstack ai
  - effect
  - ai-effect
  - generateImage
  - embed
  - AIError
  - interruption
---

You also generate images, embed text, or make speech in your Effect code. The core functions return promises, so their errors are not typed and you cannot interrupt them.

Each activity in `@tanstack/ai-effect` takes the options of the core function. It returns an `Effect`, or a `Stream` with `stream: true`. Every failure is an `AIError`.

## 1. Run an activity as an Effect

```ts ignore
import * as AI from '@tanstack/ai-effect'
import { openaiImage } from '@tanstack/ai-openai'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const { images } = yield* AI.generateImage({
    adapter: openaiImage('gpt-image-2.5-flare'),
    prompt: 'A red fox in the snow',
    threadId: 'fox',
    size: '1024x1024',
  })
  return images[0]?.url
})

const url = await Effect.runPromise(program)
```

The Effect is lazy. Each run sends a new request. TypeScript checks `size` and `modelOptions` against the model, the same as in core.

## 2. Stream an activity

Pass `stream: true` to get a `Stream` of chunks. Send it to the browser the same way as a chat:

```ts ignore
import {
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import * as AI from '@tanstack/ai-effect'
import { openaiImage } from '@tanstack/ai-openai'
import { Stream } from 'effect'

export async function POST(request: Request) {
  const { input, threadId } = await generationParamsFromRequest('image', request)
  if (typeof input.prompt !== 'string') {
    return new Response('Send a text prompt.', { status: 400 })
  }

  const stream = AI.generateImage({
    adapter: openaiImage('gpt-image-2.5-flare'),
    prompt: input.prompt,
    threadId,
    stream: true,
  })

  return toServerSentEventsResponse(Stream.toAsyncIterable(stream))
}
```

On the client, read it with a generation hook. The client does not use Effect:

```tsx
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'

export function FoxImage() {
  const { generate, result, isLoading } = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
    threadId: 'fox',
  })

  return (
    <div>
      <button
        onClick={() => generate({ prompt: 'A red fox in the snow' })}
        disabled={isLoading}
      >
        Generate
      </button>
      {result?.images.map((image, index) => (
        <img key={index} src={image.url} alt="A red fox" />
      ))}
    </div>
  )
}
```

Click **Generate**. The image appears when the stream sends its result. For the other hooks, see [Generation Hooks](../media/generation-hooks).

## Handle AIError

Every activity fails with `AIError` when the core call throws or rejects:

- `message` is the message of the original error.
- `cause` is the original error.
- `_tag` is `'AIError'`, so `Effect.catchTag` can catch it.

```ts ignore
import * as AI from '@tanstack/ai-effect'
import { openaiEmbedding } from '@tanstack/ai-openai'
import { Effect } from 'effect'

const vectors = AI.embed({
  adapter: openaiEmbedding('text-embedding-3-small'),
  input: ['a red guitar', 'a blue drum kit'],
}).pipe(
  Effect.map((result) => result.embeddings.map((embedding) => embedding.vector)),
  Effect.catchTag('AIError', (error) =>
    Effect.logError('Embedding failed', error.cause).pipe(Effect.as([])),
  ),
)
```

### A RUN_ERROR chunk does not fail the Stream

In a `Stream`, a `RUN_ERROR` chunk is a normal chunk. The Stream sends it on, and the client shows the error. The Stream fails with `AIError` only when the core iterator throws.

To act on a run error on the server, look for the chunk:

```ts ignore
import * as AI from '@tanstack/ai-effect'
import { openaiText } from '@tanstack/ai-openai'
import { Effect, Stream } from 'effect'

const stream = AI.chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Hello' }],
  threadId: 'hello',
}).pipe(
  Stream.tap((chunk) =>
    chunk.type === 'RUN_ERROR' ? Effect.logError(chunk.message) : Effect.void,
  ),
)
```

## Stop a request

You do not pass an `abortSignal`. Interruption aborts the request:

- If you interrupt the fiber, the request to the provider stops.
- If a `Stream` stops early, for example with `Stream.take`, the request stops.
- `Effect.timeout` interrupts the Effect, so it also stops the request.

```ts ignore
import * as AI from '@tanstack/ai-effect'
import { openaiImage } from '@tanstack/ai-openai'
import { Effect } from 'effect'

const quick = AI.generateImage({
  adapter: openaiImage('gpt-image-2.5-flare'),
  prompt: 'A red fox in the snow',
  threadId: 'fox',
}).pipe(Effect.timeout('30 seconds'))
```

## All wrapped activities

| Function | Returns | With `stream: true` |
| --- | --- | --- |
| `summarize` | `Effect` of the summary | `Stream` of chunks |
| `generateImage` | `Effect` of the images | `Stream` of chunks |
| `generateAudio` | `Effect` of the audio | `Stream` of chunks |
| `generateSpeech` | `Effect` of the speech | `Stream` of chunks |
| `generateVoice` | `Effect` of the voices | `Stream` of chunks |
| `generateTranscription` | `Effect` of the text | `Stream` of chunks |
| `generateVideo` | `Effect` of the job | `Stream` of the job lifecycle |
| `generateWorld` | `Effect` of the world | `Stream` of chunks |
| `generateLiveVideo` | `Effect` of the session | `Stream` of chunks |
| `getVideoJobStatus` | `Effect` of the job status | |
| `embed` | `Effect` of the vectors | |
| `rerank` | `Effect` of the ranked documents | |
| `decide` | `Effect` of the answers | |
| `listVoices` | `Effect` of the voices | |
| `uploadFile`, `getFile` | `Effect` of the file handle | |
| `deleteFile` | `Effect` of `void` | |

`chat` has its own page: [Effect](./index). For the exact types, see the [API reference](../api/ai-effect).
