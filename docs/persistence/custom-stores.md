---
title: Custom Stores
id: custom-stores
---

Use custom stores when the built-in backends do not match your infrastructure,
or when an integration needs to add durable metadata, locks, artifacts, blobs,
or internal checkpoints without changing the public chat replay stream.

This page is reference material for adapter authors. If you only need to choose
a packaged backend, start with [SQL Backends](./sql-backends) or
[Cloudflare](./cloudflare). If you need the end-to-end chat journey, start with
[Resumable Chat](./resumable-chat).

If you are deciding how to model generated files, workspace checkpoints, object
bytes, metadata manifests, and locks together, read
[Files and Artifacts](./files-and-artifacts) first. This page explains the store
interfaces behind those patterns.

## Define an `AIPersistence`

`AIPersistence` is an aggregate of optional stores. Implement only the stores
your scenario needs, then validate features with `withPersistence(...)`. During
development, `memoryPersistence()` is a useful complete baseline: replace one
store at a time with your backend implementation while keeping the feature
validation behavior realistic.

```ts group=custom-stores
import {
  defineAIPersistence,
  memoryPersistence,
  withPersistence,
} from '@tanstack/ai-persistence'
import type { MetadataStore } from '@tanstack/ai-persistence'

class AcmeMetadataStore implements MetadataStore {
  private values = new Map<string, unknown>()

  async get(scope: string, key: string) {
    return this.values.get(`${scope}:${key}`) ?? null
  }

  async set(scope: string, key: string, value: unknown) {
    this.values.set(`${scope}:${key}`, value)
  }

  async delete(scope: string, key: string) {
    this.values.delete(`${scope}:${key}`)
  }
}

const baseline = memoryPersistence()

const persistence = defineAIPersistence({
  stores: {
    ...baseline.stores,
    metadata: new AcmeMetadataStore(),
  },
})

const middleware = withPersistence(persistence, {
  features: ['messages', 'durable-replay', 'interrupts', 'metadata'],
})
```

If any required store is missing, setup fails before the run starts.

| Feature | Required stores |
| --- | --- |
| `messages` | `stores.messages` |
| `durable-replay` | `stores.runs`, `stores.publicEvents` |
| `interrupts` | `stores.runs`, `stores.publicEvents`, `stores.interrupts` |
| `internal-events` | `stores.internalEvents` |
| `metadata` | `stores.metadata` |
| `locks` | `stores.locks` |
| `artifacts` | `stores.artifacts` |
| `blobs` | `stores.blobs` |

## Keep public and internal events separate

`PublicEventStore` is the user-visible AG-UI stream. It is what reconnecting
clients replay after an opaque cursor. Store exactly the public `StreamChunk`
events there.

`InternalEventStore` is for package-owned or app-owned checkpoints:
compare-and-swap coordination, workflow checkpoints, adapter internals, or
other state that must not be replayed to the UI. Keep those events namespaced
and separate from the public stream.

## Store app metadata

Use `MetadataStore` for durable key/value state associated with a thread, run,
or integration. MCP session correlation is a good example: the base persistence
schema records public stream replay, while app-owned metadata can map a thread
or run to an MCP session id.

```ts group=custom-stores
await persistence.stores.metadata?.set(
  'thread:weather-chat',
  'mcp-session',
  { serverId: 'weather', sessionId: 'session-123' },
)
```

Use a stable scope convention such as `thread:<threadId>` or `run:<runId>` so
multiple integrations do not collide.

## Add locks, artifacts, and blobs when needed

`stores.locks` provides a shared `LockStore` capability. Sandboxes and workflow
extensions use it to prevent two processes from resuming or mutating the same
durable resource at the same time.

`stores.artifacts` stores generated artifacts by `artifactId`, `runId`, and
`threadId`. `stores.blobs` stores raw bytes and can be shared by artifacts or
other integrations. A backend may store artifact metadata in SQL and bytes in
object storage, as the [Cloudflare backend](./cloudflare) does with D1 and R2.
For concrete run-artifact, blob, and sandbox workspace examples, see
[Files and Artifacts](./files-and-artifacts).

## Extend without growing the base schema

MCP and workflow packages should build on the common stores instead of adding
new base persistence tables for every feature:

- use public events for UI replay,
- use internal events for checkpoints,
- use metadata for app-owned correlation,
- use locks for cross-process coordination,
- use artifacts and blobs for durable outputs.

That keeps resumable chat small for apps that only need messages and replay,
while still giving advanced integrations durable primitives.
