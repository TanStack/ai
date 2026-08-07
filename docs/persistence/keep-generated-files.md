---
title: Keep Generated Files (Advanced)
id: keep-generated-files
description: "Save generated media to your storage and serve from your origin before provider URLs expire."
---

# Keep Generated Files

If you need media after provider URLs expire → add `artifacts` + `blobs` (together) on top of [Generation persistence](./generation-persistence).

| Stores | Result |
| --- | --- |
| `artifacts` + `blobs` | Bytes written, `ArtifactRecord` saved, durable refs on result + run |
| neither | Run record only |

`memoryPersistence()` ships all three (`generationRuns`, `artifacts`, `blobs`). Production: implement both contracts — [Build a generation adapter](./build-your-own-generation-adapter).

## 1. Stamp durable URLs on generate

```ts group=generation-bytes
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import {
  memoryPersistence,
  withGenerationPersistence,
} from '@tanstack/ai-persistence'

const persistence = memoryPersistence()

export async function POST(request: Request) {
  const { input, threadId } = await generationParamsFromRequest(
    'image',
    request,
  )

  if (typeof input.prompt !== 'string') {
    throw new Error('This endpoint accepts text image prompts only.')
  }
  if (threadId === undefined) {
    return new Response('`threadId` is required', { status: 400 })
  }

  const stream = generateImage({
    adapter: openaiImage('gpt-image-2'),
    prompt: input.prompt,
    threadId,
    stream: true,
    middleware: [
      withGenerationPersistence(persistence, {
        artifactUrl: (ref) =>
          `/api/generate/image/artifact?id=${ref.artifactId}`,
      }),
    ],
  })

  return toServerSentEventsResponse(stream)
}
```

## 2. Serve bytes on a separate route

Do **not** reuse the generation `GET` (hydration/resume). Authorize before serve — 404 not 403 on forbidden.

```ts group=generation-bytes
import {
  retrieveArtifact,
  retrieveBlob,
} from '@tanstack/ai-persistence'

// routes/api.generate.image.artifact.ts
export async function GET(request: Request) {
  const artifactId = new URL(request.url).searchParams.get('id')
  if (!artifactId) return new Response('missing id', { status: 400 })

  const artifact = await retrieveArtifact(persistence, artifactId)
  if (!artifact) return new Response('not found', { status: 404 })

  // Replace with session + ownership (artifact.threadId / runId).
  const owned = true
  void request
  if (!owned) return new Response('not found', { status: 404 })

  const blob = await retrieveBlob(persistence, artifact)
  if (!blob) return new Response('not found', { status: 404 })

  return new Response(blob.body ?? (await blob.arrayBuffer()), {
    headers: {
      'content-type': artifact.mimeType,
      'content-length': String(artifact.size),
    },
  })
}
```

Default blob key: `artifacts/<runId>/<artifactId>`.

### Video: honour `Range`

Images work with the route above. Video seeking needs `206` + range support:

```ts group=generation-bytes
import { parseRangeHeader } from '@tanstack/ai-persistence'
import type { ArtifactRecord } from '@tanstack/ai-persistence'

export async function serveArtifactBytes(
  request: Request,
  artifact: ArtifactRecord,
) {
  const range = parseRangeHeader(request.headers.get('range'), artifact.size)
  if (range === 'unsatisfiable') {
    return new Response('range not satisfiable', {
      status: 416,
      headers: { 'content-range': `bytes */${artifact.size}` },
    })
  }

  const blob = await retrieveBlob(
    persistence,
    artifact,
    range ? { range } : undefined,
  )
  if (!blob) return new Response('not found', { status: 404 })

  const body = blob.body ?? (await blob.arrayBuffer())
  const headers = {
    'content-type': artifact.mimeType,
    'accept-ranges': 'bytes',
  }
  if (!blob.range) {
    return new Response(body, {
      headers: { ...headers, 'content-length': String(artifact.size) },
    })
  }
  const { offset, length } = blob.range
  return new Response(body, {
    status: 206,
    headers: {
      ...headers,
      'content-length': String(length),
      'content-range': `bytes ${offset}-${offset + length - 1}/${artifact.size}`,
    },
  })
}
```

```tsx
import type { PersistedArtifactRef } from '@tanstack/ai'

export function GeneratedVideo({ artifact }: { artifact: PersistedArtifactRef }) {
  return <video src={artifact.url} controls preload="metadata" />
}
```

Store must support ranged reads — [conformance](./store-reference#blobstore).

Optional capture knobs: `extractArtifacts`, `nameArtifact` on `withGenerationPersistence`.

## Custom storage keys

```ts group=generation-bytes
const storageKeyOptions = withGenerationPersistence(persistence, {
  storageKey: ({ runId, artifactId, role, name }) =>
    `products/${role}/${runId}-${artifactId}-${name}`,
})
```

1. Resolved key is stored as `ArtifactRecord.blobKey` (cannot recompute arbitrary paths).
2. Pre-`blobKey` rows fall back to the default convention.
3. Non-unique keys overwrite — include `artifactId` unless overwrite is intentional.

Server-side only. Browser-supplied keys would be path-traversal vectors.

## Prompt media by URL

**Generated output** with expiring links: middleware downloads and stores (the point of this page).

Prompt inputs:

| Source | Stored? |
| --- | --- |
| base64 (`source: { type: 'data' }`) | Yes — bytes already in hand |
| URL (`source: { type: 'url' }`) | **No** by default (SSRF risk + redundant copy) |

Opt in with a **predicate**:

```ts group=generation-bytes
const inputUrlOptions = withGenerationPersistence(persistence, {
  allowInputUrl: ({ url }) => url.hostname.endsWith('.cdn.example.com'),
})
```

**Every fetch (input or output):**

1. Scheme `http:` or `https:` only
2. Abort after `artifactFetchTimeoutMs` (default 30s)
3. Cap at `maxArtifactBytes` (default 1 GiB; `false` = no cap)

**Input fetches also:** block loopback/private/link-local; no redirect follow.

Treat as backstop — keep `allowInputUrl` narrow; inject `artifactFetch` for egress-restricted proxy when needed.

## Streaming, not buffering

Provider URL streams into the blob store; `size` counts as bytes drain. `memoryPersistence` holds in-process (dev/test only).

`maxArtifactBytes` bounds **transfer**, not memory (`content-length` is advisory).

| Response | Store receives |
| --- | --- |
| `content-length`, no `content-encoding` | `fetch` body **untouched**, length intact |
| chunked / no length | counting wrapper |
| `content-encoding: gzip` | counting wrapper |

Length-strict stores (e.g. R2 single-shot) use multipart when length is absent — skill `ai-persistence/build-cloudflare-artifact-store`.

```ts group=generation-bytes
const uncappedOptions = withGenerationPersistence(persistence, {
  maxArtifactBytes: false,
})
```

Keep the cap when callers name URLs via `allowInputUrl`.

## What `artifactUrl` does

1. Stamps `ref.url` on each persisted ref.
2. Rewrites live result media fields (`result.images[i].url`, `result.url`, `result.audio.url`) to your origin.

Reload rebuilds `result` from persisted refs via those durable URLs. `result.artifacts` is the full artifact surface on the hook.

## Next

- [Generation persistence](./generation-persistence) — run record + `generationRuns`
- [Build a generation adapter](./build-your-own-generation-adapter) — custom `ArtifactStore` / `BlobStore`
