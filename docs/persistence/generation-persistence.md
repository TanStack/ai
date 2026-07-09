---
title: Generation Persistence
id: generation-persistence
---

Use generation persistence when the generated media from an image, audio,
speech, transcription, or video endpoint should survive a refresh. The server
owns the durable run through `withGenerationPersistence(...)`, which records run
status plus artifact/blob records; the client keeps only a lightweight,
read-only state snapshot for observability.

By the end, your generation hook can display generated media from persisted
artifact refs instead of browser-stored bytes, and observe the last run's status
after a reload.

## Install a backend with artifacts and blobs

Generated media/file persistence requires both `stores.artifacts` and
`stores.blobs`. The batteries-included SQLite backend provides both: artifact
metadata rows and blob bytes. For a cloud object store (R2/S3) behind the blob
side, bring your own blob store via [Custom Stores](./custom-stores).

```sh
pnpm add @tanstack/ai-persistence @tanstack/ai-persistence-drizzle
```

## Create the generation endpoint

Read the hook request with `generationParamsFromRequest(...)`, pass the resume
identity into the generation call, and add `withGenerationPersistence(persistence)`.
Return the stream with `toServerSentEventsResponse(...)` so the client can read
both live events and replayed events.

```ts group=generation-persistence-server
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'
import { withGenerationPersistence } from '@tanstack/ai-persistence'

// State durability: run status + artifact metadata + blob bytes. The
// batteries-included SQLite backend stores artifact bytes in a blob column;
// for a cloud object store (R2/S3), bring your own blob store via custom stores.
const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:.tanstack-ai/generation.sqlite',
  migrate: true,
})

export async function POST(request: Request) {
  const { input, threadId, runId } =
    await generationParamsFromRequest('image', request)

  if (typeof input.prompt !== 'string') {
    throw new Error('This endpoint accepts text image prompts only.')
  }

  const identity: { threadId?: string; runId?: string } = {}
  if (threadId !== undefined) identity.threadId = threadId
  if (runId !== undefined) identity.runId = runId

  const stream = generateImage({
    ...identity,
    prompt: input.prompt,
    adapter: openaiImage('gpt-image-2'),
    stream: true as const,
    middleware: [withGenerationPersistence(persistence)],
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

When the same app also uses `withChatPersistence`, keep **run IDs unique across
activities**. Chat and generation may share one `AIPersistence` backend and even
the same `threadId`, but `runs` is keyed only by `runId`. Client hooks allocate
a fresh `run-…` id per send/generate by default; only override ids deliberately.
See [Persistence Overview](./overview#run-ids-must-be-unique-across-activities)
and [Persistence Internals](./internals#shared-backends-unique-runid-across-chat-and-generation).

## Wire the client hook

Use `persistence.server` to store the latest generation state snapshot under a
stable `id`. The snapshot contains `{ threadId, runId }`, status, errors, and
lightweight artifact refs. It does not contain generated image, audio, or video
bytes.

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

      {image.resumeState && <p>Last run: {image.resumeState.runId}</p>}

      {image.pendingArtifacts.map((artifact) => (
        <a key={artifact.artifactId} href={`/api/artifacts/${artifact.artifactId}`}>
          {artifact.name}
        </a>
      ))}
    </section>
  )
}
```

The snapshot is **read-only**. Generation hooks never auto-start a run on mount
and expose no `resume()` action — a run begins only when you call
`generate(...)`. `resumeState`, `pendingArtifacts`, and `resultArtifacts` let you
render persisted artifact refs and observe the last run's status after a reload;
they do not reconnect to a server run. Pass `initialResumeSnapshot` to hydrate
this state from your own store when the identity lives outside the hook
persistence adapter.

## Serve persisted artifacts

Generation hooks store lightweight artifact refs. Serve the durable bytes from
your app by looking up the artifact by `artifactId`.

```ts
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'

const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:.tanstack-ai/generation.sqlite',
  migrate: true,
})

export async function GET(
  request: Request,
  context: { params: Promise<{ artifactId: string }> },
) {
  void request
  const { artifactId } = await context.params
  const { stores } = persistence

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

Passing `withGenerationPersistence(persistence)` into a generation call enables built-in
artifact persistence when the selected backend exposes both stores. Built-in
extraction covers input media prompt parts, generated media outputs, generated
video URLs, transcription input audio, and structured transcription JSON.

Use `extractArtifacts` when your app needs a different artifact set than the
built-in extractor. Providing it replaces built-in extraction for that run, so
include every input and output artifact you want persisted.

```ts
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { sqlPersistence } from '@tanstack/ai-persistence-drizzle'
import { withGenerationPersistence } from '@tanstack/ai-persistence'

const persistence = sqlPersistence({
  dialect: 'sqlite',
  url: 'file:.tanstack-ai/generation.sqlite',
  migrate: true,
})

const result = await generateImage({
  threadId: 'thread-123',
  runId: 'run-123',
  adapter: openaiImage('gpt-image-2'),
  prompt: 'A product photo on a white background',
  middleware: [
    withGenerationPersistence(persistence, {
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

Generated bytes are persisted by the server through artifact/blob stores, and
`withGenerationPersistence(...)` records generation run status plus artifact/blob
records. State durability does not itself make the delivered stream resumable —
that is a transport concern; pair the endpoint with a delivery-durability sink
(see [Delivery Durability](./delivery-durability)). If your endpoint aborts the
provider request when the browser disconnects, resume cannot produce a future
result for work the server canceled. Resumable generation needs a durable
producer that outlives the client socket, or a durable result that your endpoint
can read when the client reconnects. For the artifact write path, see
[Persistence Internals](./internals).
