---
title: Generation Persistence
id: generation-persistence
---

Use generation persistence when an image, audio, speech, transcription, or video
endpoint should survive a refresh, tab reconnect, or transient network drop.
The server owns the durable run through `withPersistence(...)`; the client
stores only the lightweight resume snapshot it needs to reconnect.

By the end, your generation hook can resume a streaming endpoint and display
generated media from persisted artifact refs instead of browser-stored bytes.

## Install a backend with artifacts and blobs

Generated media/file persistence requires both `stores.artifacts` and
`stores.blobs`. Cloudflare D1 plus R2 is the durable media path shown below:
D1 stores replay state and artifact metadata, while R2 stores generated media
bytes.

```sh
pnpm add @tanstack/ai-persistence @tanstack/ai-persistence-cloudflare
```

## Create the generation endpoint

Read the hook request with `generationParamsFromRequest(...)`, pass the resume
identity into the generation call, and add `withPersistence(persistence)`.
Return the stream with `toServerSentEventsResponse(...)` so the client can read
both live events and replayed events.

```ts group=generation-persistence-server
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'
import { withPersistence } from '@tanstack/ai-persistence'

interface Env {
  AI_D1: D1Database
  AI_BLOBS: R2Bucket
  AI_LOCKS: DurableObjectNamespace
}

function persistence(env: Env) {
  return cloudflarePersistence({
    d1: env.AI_D1,
    r2: env.AI_BLOBS,
    durableObjects: env.AI_LOCKS,
    migrate: true,
  })
}

export async function POST(request: Request, env: Env) {
  const { input, threadId, runId, cursor } =
    await generationParamsFromRequest('image', request)

  if (typeof input.prompt !== 'string') {
    throw new Error('This endpoint accepts text image prompts only.')
  }

  const identity: { threadId?: string; runId?: string; cursor?: string } = {}
  if (threadId !== undefined) identity.threadId = threadId
  if (runId !== undefined) identity.runId = runId
  if (cursor !== undefined) identity.cursor = cursor

  const stream = generateImage({
    ...identity,
    prompt: input.prompt,
    adapter: openaiImage('gpt-image-2'),
    stream: true as const,
    middleware: [withPersistence(persistence(env))],
  })

  return toServerSentEventsResponse(stream)
}
```

Use the generation kind that matches the endpoint: `'image'`, `'audio'`,
`'tts'`, `'video'`, or `'transcription'`. If you already parsed JSON in your
framework route, call `generationParamsFromBody(kind, body)` instead of
`generationParamsFromRequest(kind, request)`.

`forwardedProps` are app-controlled request metadata. Do not pass them directly
to `modelOptions`; validate and whitelist any app-specific routing or provider
options before using them on the server.

## Wire the client hook

Use `persistence.server` to store the latest generation resume snapshot under a
stable `id`. The snapshot contains `{ threadId, runId, cursor }`, status,
errors, and lightweight artifact refs. It does not contain generated image,
audio, or video bytes.

```tsx group=generation-persistence-client
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'
import { localStorageAIPersistence } from '@tanstack/ai-client'

const generationId = 'hero-image'

export function HeroImageGenerator() {
  const image = useGenerateImage({
    id: generationId,
    connection: fetchServerSentEvents('/api/generate/image'),
    persistence: {
      server: localStorageAIPersistence({
        keyPrefix: 'tanstack-ai:generation-resume:',
      }),
    },
  })

  return (
    <section>
      <button
        disabled={image.isLoading}
        onClick={() => image.generate({ prompt: 'A glass cabin in a pine forest' })}
      >
        Generate
      </button>

      {image.resumeState && (
        <button disabled={image.isLoading} onClick={() => image.resume()}>
          Resume
        </button>
      )}

      {image.pendingArtifacts.map((artifact) => (
        <a key={artifact.artifactId} href={`/api/artifacts/${artifact.artifactId}`}>
          {artifact.name}
        </a>
      ))}
    </section>
  )
}
```

Auto-resume is enabled by default. Set `autoResume: false` when the UI should
wait for an explicit user action, then call `resume()`. `resume(state)` can also
accept an explicit `{ threadId, runId, cursor }` when your app stores the
identity outside the hook persistence adapter.

## Serve persisted artifacts

Generation hooks store lightweight artifact refs. Serve the durable bytes from
your app by looking up the artifact by `artifactId`.

```ts
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'

interface Env {
  AI_D1: D1Database
  AI_BLOBS: R2Bucket
  AI_LOCKS: DurableObjectNamespace
}

function persistence(env: Env) {
  return cloudflarePersistence({
    d1: env.AI_D1,
    r2: env.AI_BLOBS,
    durableObjects: env.AI_LOCKS,
    migrate: true,
  })
}

export async function GET(
  request: Request,
  context: { params: Promise<{ artifactId: string }> },
  env: Env,
) {
  void request
  const { artifactId } = await context.params
  const { stores } = persistence(env)

  if (!stores.artifacts || !stores.blobs) {
    throw new Error('Artifact and blob stores are required.')
  }

  const artifact = await stores.artifacts.get(artifactId)

  if (!artifact) {
    return new Response('Artifact not found', { status: 404 })
  }

  const blob = await stores.blobs.get(
    `artifacts/${artifact.runId}/${artifact.artifactId}`,
  )

  if (!blob) {
    return new Response('Artifact not found', { status: 404 })
  }

  return new Response(blob.body ?? (await blob.arrayBuffer()), {
    headers: {
      'Content-Type': artifact.mimeType,
      'Content-Length': String(artifact.size),
      'Content-Disposition': `inline; filename="${artifact.name}"`,
    },
  })
}
```

## Customize generated artifacts

Passing `withPersistence(persistence)` into a generation call enables built-in
artifact persistence when the selected backend exposes both stores. Built-in
extraction covers input media prompt parts, generated media outputs, generated
video URLs, transcription input audio, and structured transcription JSON.

Use `extractArtifacts` when your app needs a different artifact set than the
built-in extractor. Providing it replaces built-in extraction for that run, so
include every input and output artifact you want persisted.

```ts
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'
import { withPersistence } from '@tanstack/ai-persistence'

declare const env: {
  AI_D1: D1Database
  AI_BLOBS: R2Bucket
  AI_LOCKS: DurableObjectNamespace
}

const persistence = cloudflarePersistence({
  d1: env.AI_D1,
  r2: env.AI_BLOBS,
  durableObjects: env.AI_LOCKS,
})

const result = await generateImage({
  threadId: 'thread-123',
  runId: 'run-123',
  adapter: openaiImage('gpt-image-2'),
  prompt: 'A product photo on a white background',
  middleware: [
    withPersistence(persistence, {
      extractArtifacts: ({ result }) => [
        {
          role: 'output',
          path: 'metadata',
          mediaType: 'json',
          mimeType: 'application/json',
          json: { generatedAt: new Date().toISOString(), result },
          name: 'generation-metadata.json',
        },
      ],
      nameArtifact: ({ descriptor, index }) =>
        `${descriptor.role}-${descriptor.mediaType ?? 'artifact'}-${index}.bin`,
    }),
  ],
})

console.log(result.artifacts)
```

## Understand what resumes

Generation hooks persist a lightweight client snapshot, not media bytes. The
snapshot stores `resumeState`, status, pending artifact refs, completed result
artifact refs, and lightweight error metadata.

Generated bytes are persisted by the server through artifact/blob stores. If
your endpoint aborts the provider request when the browser disconnects, resume
replays persisted events up to the last cursor. It cannot produce a future
result for work the server canceled. If your endpoint starts or tails durable
server-side work, the hook can reconnect to the same run and receive later
events when the producer continues after the browser disconnects.
