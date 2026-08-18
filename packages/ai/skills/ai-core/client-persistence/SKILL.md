---
name: ai-core/client-persistence
description: >
  Browser chat persistence on useChat / ChatClient: localStoragePersistence,
  sessionStoragePersistence, indexedDBPersistence. Client-authoritative
  (adapter, full transcript) vs server-authoritative (persistence: true, no
  client cache).
  Reload restore, pending interrupts, mid-stream rejoin with delivery
  durability. Use for SPA reload durability — NOT server history alone.
  Also covers generation hooks (useGenerateImage etc.), which take only the
  server-driven mode: persistence: true hydrates the last generation for the
  (REQUIRED) threadId from the server on mount and repaints status/result/error,
  nothing is cached in the browser.
  No extra package: the adapters ship in the framework packages.
type: sub-skill
library: tanstack-ai
library_version: '0.42.0'
sources:
  - 'TanStack/ai:docs/persistence/client-persistence.md'
  - 'TanStack/ai:docs/persistence/overview.md'
---

# Client Persistence

> Builds on ai-core, and on `ai-core/chat-experience` for `useChat` itself.
>
> **No extra package.** The adapters below ship in the **framework** packages
> (`@tanstack/ai-react` and friends, re-exported from `@tanstack/ai-client`),
> so browser persistence needs nothing installed beyond what a chat UI already
> has. The **server** half is a separate package — see
> `@tanstack/ai-persistence` and its `ai-persistence/server` skill.

A `ChatClient` / `useChat` keeps messages in memory. The `persistence` option
stores one record per `threadId` so a reload can repaint the transcript,
restore a pending interrupt, and rejoin an in-flight run.

Import adapters from the **framework package** (not `@tanstack/ai-client`
unless vanilla JS):

```tsx
import {
  useChat,
  fetchServerSentEvents,
  localStoragePersistence,
  sessionStoragePersistence,
  indexedDBPersistence,
} from '@tanstack/ai-react'
```

## Adapters

| Adapter                       | Survives                   | Notes                                                           |
| ----------------------------- | -------------------------- | --------------------------------------------------------------- |
| `localStoragePersistence()`   | Reloads + browser restarts | Sync hydrate; quota-bound; JSON codec default                   |
| `sessionStoragePersistence()` | Reloads in the same tab    | Cleared when tab/session ends                                   |
| `indexedDBPersistence()`      | Reloads + restarts         | Async open (first paint may be empty briefly); structured clone |

All default to the chat persisted-state shape — no type argument or codec
required for normal use.

## Mode A — cache everything (client-authoritative)

```tsx
function Chat() {
  const { messages, sendMessage } = useChat({
    threadId: 'support-chat', // stable — required
    connection: fetchServerSentEvents('/api/chat'),
    persistence: localStoragePersistence(),
  })
  // ...
}
```

Bare adapter ≡ full transcript + resume pointer. Browser owns history; server
(if any) mirrors when you post non-empty `messages`.

Best for: SPA, offline-first, single device, moderate conversation size.

## Mode B — server-authoritative (`persistence: true`)

```tsx
function Chat({ threadId }: { threadId: string }) {
  const { messages, sendMessage } = useChat({
    threadId,
    connection: fetchServerSentEvents('/api/chat'),
    persistence: true,
  })
  // ...
}
```

Nothing is cached client-side: no transcript, no resume pointer.

On mount, `useChat` hydrates the thread from the **server** by `threadId`
(paint + tail active run). Same path for another device. Pair with server
`withPersistence` + a hydrate route (`reconstructChat` or equivalent).

Best for: large transcripts, multi-device, compliance (no message bodies in
browser storage).

## What a reload restores

1. **Finished run** — transcript from the adapter (mode A) or server (mode B).
2. **Paused on interrupt** — approval UI restored (from the adapter in mode A,
   the server hydrate in mode B).
3. **Still streaming** — needs **delivery durability** on the route
   (`toServerSentEventsResponse(stream, { durability: … })`) so the client can
   `joinRun` and finish the reply. Persistence alone is not enough.

## Stable `threadId` is the identity

Persistence keys on `threadId`. The hooks have **no separate `id` option** — a
chat's identity _is_ its `threadId`. Without a stable one, each load is a new
chat. Generate it server-side or from a route param the user owns; do not
randomize per mount.

## Generation hooks: server-driven only

The generation hooks (`useGenerateImage`, `useGenerateVideo`, `useGeneration`,
`useSummarize`, `useTranscription`, …) take a `persistence` option too, but it is
**boolean only** — there is no storage-adapter mode, and the browser caches
nothing. **The hooks are transparent, mirroring `useChat`:** a reload repaints the
hook's
**normal** fields — `status` (`'idle'` / `'generating'` / `'success'` /
`'error'`), `error`, and `result` — as if the run had just finished. There is
**no** `resumeSnapshot`, `resumeState`, `pendingArtifacts`, or `resultArtifacts`
field. The one extra field is `runId`: the id of the generation job currently
running, or `null` when nothing is in flight. The persisted record holds run
identity, status, error, and result metadata (ids, model, a provider video job
id), **never the generated media bytes**.

The hook return is exactly `generate` / `result` / `isLoading` / `error` /
`status` / `stop` / `reset` / `runId`.

### Turning it on (`persistence: true`)

```tsx
const image = useGenerateImage({
  threadId, // REQUIRED — the scope the last generation is hydrated under
  connection: fetchServerSentEvents('/api/generate/image'),
  persistence: true,
})
// After a reload: image.status / image.result / image.error are the last
// generation for `threadId`, fetched from the server — nothing was cached.
```

The server half — the same route handles the run and the hydration `GET`:

```ts
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import {
  memoryPersistence,
  reconstructGeneration,
  withGenerationPersistence,
} from '@tanstack/ai-persistence'

// Needs `stores.generationRuns`; `memoryPersistence()` ships one.
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
    throw new Error('Generation persistence requires a `threadId`.')
  }

  return toServerSentEventsResponse(
    generateImage({
      adapter: openaiImage('gpt-image-2'),
      prompt: input.prompt,
      // The stable slot this run fills. Required by persistence: the run record
      // is filed under it, and the client hydrates by it on mount.
      threadId,
      stream: true,
      middleware: [withGenerationPersistence(persistence)],
    }),
  )
}

// Mount-time hydration: resolves `?runId=` (preferred) or the latest run linked
// to `?threadId=`, and returns `{ resumeSnapshot, activeRun }`.
export function GET(request: Request) {
  return reconstructGeneration(persistence, request, {
    // Multi-user routes MUST authorize: the ids come from the caller. Derive
    // identity from server-side session state, then check ownership.
    authorize: async (id, req) => {
      // const user = await auth(req)
      // return user != null && (await db.threadOwnedBy(user.id, id))
      void id
      void req
      return true
    },
  })
}
```

- Nothing is cached client-side. On mount the client hydrates the **last
  generation** for its `threadId` from the server via the connection's
  `hydrateGeneration` handler (the SSE/HTTP adapters issue a `GET` with
  `?threadId=` to the same endpoint URL) and repaints it into the normal fields.
- The server `GET` returns `reconstructGeneration(persistence, request)` from
  `@tanstack/ai-persistence` — it resolves the run by `?runId=` (preferred) or
  the latest run linked to `?threadId=`, and needs `stores.generationRuns`. Pair it with
  `withGenerationPersistence` on the generation route. See
  `ai-core/media-generation` and `ai-persistence`.
- Best for multi-device / compliance (no generation metadata in browser
  storage), exactly like chat's server-authoritative mode.

### Restoring media: byte storage + `artifactUrl`

`result` comes back with its media only when the **server** persists the bytes
(`stores.artifacts` + `stores.blobs`) AND `withGenerationPersistence` is given an
`artifactUrl` mapper:

```ts
withGenerationPersistence(persistence, {
  artifactUrl: (ref) => `/api/generate/image/artifact?id=${ref.artifactId}`,
})
```

`artifactUrl` stamps a durable app-origin URL onto each persisted ref and
rewrites the live result's media to it, so live and restored results match. The
durable refs travel on `result.artifacts`; on restore the hook rebuilds `result`
from them, so `result.images[i].url` (or a video's `result.url`) serves from your
own origin. `result.artifacts` is the whole artifact surface on the hook.
Without byte storage, a reload restores `status` / `error` and `result` stays
`null`.

Also worth knowing:

- `stop()` marks the record no longer resumable; `reset()` clears the in-memory
  snapshot.
- Nothing auto-runs from a hydrated record — `generate(...)` is always explicit.
- Use `status` / `result` for a finished run; use `runId` to tell that a run was
  still generating when the page closed, and to name it to your own server (to
  cancel or poll the provider job — `stop()` only aborts the local stream).

## Common mistakes

### HIGH: No `threadId`

Record cannot be found after reload.

### HIGH: Passing `id` to `useChat`

Removed — `threadId` is the identity. (`ChatClient` still accepts `id` directly
as a lower-level escape hatch for keying storage separately from the wire
thread; the framework hooks do not.)

### HIGH: `persistence: true` without server history

Empty chat after reload unless the server can reconstruct by `threadId`.

### MEDIUM: Huge transcripts in `localStorage`

Quota and main-thread cost. Prefer `persistence: true` + server store, or
IndexedDB with care.

### MEDIUM: Expecting multi-device sync from client storage alone

`localStorage` is per-browser. Use server persistence for multi-device.

## Cross-references

- **ai-persistence/server** (`@tanstack/ai-persistence`) — authoritative server half
- **ai-core/chat-experience** — `useChat`, resumable connections
- Resumable streams docs — mid-stream rejoin
