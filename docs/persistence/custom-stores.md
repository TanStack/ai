---
title: Custom Stores
id: custom-stores
---

# Custom Persistence Stores

Implement custom stores when your infrastructure is not covered by the
packaged backends or when selected data must remain in an application-owned
database.

## Define the stores you provide

```ts
import { defineAIPersistence } from '@tanstack/ai-persistence'
import type {
  InterruptStore,
  MessageStore,
  RunStore,
} from '@tanstack/ai-persistence'

declare const messages: MessageStore
declare const runs: RunStore
declare const interrupts: InterruptStore

export const persistence = defineAIPersistence({
  stores: { messages, runs, interrupts },
})
```

`defineAIPersistence` preserves the exact store keys in the type and rejects
unknown keys at runtime. Middleware behavior follows the keys that exist.

## Store interfaces

### Messages

```ts
import type { ModelMessage } from '@tanstack/ai'

interface MessageStore {
  loadThread(threadId: string): Promise<Array<ModelMessage>>
  saveThread(
    threadId: string,
    messages: Array<ModelMessage>,
  ): Promise<void>
}
```

`saveThread` receives the full authoritative model-message history, not a
delta.

### Runs

```ts
import type { RunRecord } from '@tanstack/ai-persistence'

interface RunStore {
  createOrResume(input: {
    runId: string
    threadId: string
    status?: 'running' | 'completed' | 'failed' | 'interrupted'
    startedAt: number
  }): Promise<RunRecord>
  update(
    runId: string,
    patch: Partial<
      Pick<RunRecord, 'status' | 'finishedAt' | 'error' | 'usage'>
    >,
  ): Promise<void>
  get(runId: string): Promise<RunRecord | null>
}
```

Implement `createOrResume` idempotently. Retries may repeat the same run id.

### Interrupts

Interrupt persistence is an atomic capability, not a collection of sequential
`create`, `resolve`, and `cancel` calls. Opening a batch must store all
descriptors and protected bindings together. Committing a response must compare
the expected generation and exact ID set, then resolve every item and create
the continuation receipt in the same transaction.

```ts
import type {
  CommitInterruptResolutionsInput,
  InterruptCommitResult,
  InterruptRecoveryQuery,
  InterruptRecoveryStateV1,
  OpenInterruptBatchInput,
} from '@tanstack/ai'

interface InterruptStore {
  openInterruptBatch(input: OpenInterruptBatchInput): Promise<{
    generation: number
    descriptors: OpenInterruptBatchInput['descriptors']
  }>
  commitInterruptResolutions(
    input: CommitInterruptResolutionsInput,
  ): Promise<InterruptCommitResult>
  getInterruptRecoveryState(
    input: InterruptRecoveryQuery,
  ): Promise<InterruptRecoveryStateV1>
}
```

The commit result is the durable receipt:

- `committed` returns the newly accepted `continuationRunId`;
- `replayed` returns the same winning continuation for an exact idempotent
  retry;
- `conflict` returns authoritative recovery state for a stale generation or a
  different submission.

Compute and compare the canonical submission fingerprint inside the same
transaction as the current-run/parent-run compare-and-swap. Never rerun tools
for `replayed`. Do not accept a subset or superset of the opened IDs.

An `interrupts` store requires a `runs` store when used with chat persistence.
`defineAIPersistence` rejects an adapter that advertises interrupts without the
atomic methods. See [Interrupts](../chat/interrupts) for client semantics and
[Delivery durability](./delivery-durability) for exact replay behavior.

### Explicit recovery handler

Expose recovery only on an application-owned route. The handler does not infer
a URL and must authorize the caller and thread before reading state:

```ts
// app/api/interrupts/recovery/route.ts
import { createInterruptRecoveryHandler } from '@tanstack/ai-persistence'
import { persistence } from '../../../../persistence'
import { authorizeInterruptRecovery } from '../../../../authorization'

export const POST = createInterruptRecoveryHandler({
  gateway: persistence.stores.interrupts,
  authorize: authorizeInterruptRecovery,
})
```

Treat the concrete authorization object as application policy: authenticate the
request, authorize the requested thread, and redact protected bindings or
responses that the caller must not receive. Configure the matching client URL
explicitly with `createInterruptStateFetcher`.

### Metadata

```ts
interface MetadataStore {
  get(scope: string, key: string): Promise<unknown | null>
  set(scope: string, key: string, value: unknown): Promise<void>
  delete(scope: string, key: string): Promise<void>
}
```

Namespaces and value schemas are application-owned.

### Artifacts and blobs

`ArtifactStore` contains searchable metadata only:

```ts
interface ArtifactRecord {
  artifactId: string
  runId: string
  threadId: string
  name: string
  mimeType: string
  size: number
  externalUrl?: string
  createdAt: number
}
```

Bytes live in `BlobStore`, keyed separately. Generation and sandbox workspace
persistence require both stores. Blob listing may use its own pagination
`cursor`; that cursor belongs to the blob store and is unrelated to SSE resume
offsets.

### Locks

`LockStore` comes from `@tanstack/ai`. Use it to serialize work that may run on
multiple workers. A lock implementation should use leases or another recovery
mechanism so a crashed owner cannot block forever. `withLock` passes an
`AbortSignal` to the critical section. Lease-backed implementations abort that
signal when ownership can no longer be guaranteed; callbacks must stop starting
external mutations and pass the signal to cancellable dependencies.

## Example message store

```ts
import type {
  MessageStore,
} from '@tanstack/ai-persistence'
import type { ModelMessage } from '@tanstack/ai'

const threads = new Map<string, Array<ModelMessage>>()

export const messages: MessageStore = {
  async loadThread(threadId) {
    return [...(threads.get(threadId) ?? [])]
  },
  async saveThread(threadId, nextMessages) {
    threads.set(threadId, [...nextMessages])
  },
}
```

For durable infrastructure, preserve the same semantics with database
transactions, conditional writes, or stable idempotency keys.

## Override selected packaged stores

```ts ignore
/// <reference types="@cloudflare/workers-types" />

import { composePersistence } from '@tanstack/ai-persistence'
import { cloudflarePersistence } from '@tanstack/ai-persistence-cloudflare'
import type { InterruptStore, RunStore } from '@tanstack/ai-persistence'

declare const env: {
  AI_STATE: D1Database
  AI_MEDIA: R2Bucket
}
declare const interrupts: InterruptStore
declare const runs: RunStore

const base = cloudflarePersistence({ d1: env.AI_STATE, r2: env.AI_MEDIA })

export const persistence = composePersistence(base, {
  overrides: { interrupts, runs },
})
```

Only those two stores move to the custom database. D1 still owns messages and
metadata, while R2 still owns artifacts and blobs. Composition does not create
a transaction across those systems; design related writes accordingly.
