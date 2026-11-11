---
title: Store Checkpoints
id: portable-snapshots-storage
order: 19
description: "Write a durable SandboxCheckpointStore over SQL and R2, prove it with the conformance suite, and delete old checkpoints and unused blobs."
---

Implement `SandboxCheckpointStore` over your database, and keep the file bytes in an R2 bucket. Then call `deleteCheckpoints` and `sweepSandboxBlobs` to keep storage small.

The store never reads or deletes blob bytes. It counts how many checkpoints use each blob. The sweep deletes the bytes that no checkpoint uses.

| Data | Where to keep it |
| --- | --- |
| Checkpoints, heads, writer leases, blob counts | Your `SandboxCheckpointStore`, for example in SQL tables. |
| File and artifact bytes | Any object with `get`, `head`, and `put`. An R2 bucket fits. |

`InMemorySandboxCheckpointStore` in `@tanstack/ai-sandbox` obeys every rule on this page. Use its source as a reference for your own store.

## Write the store

1. Obey these rules in every method:

| Rule | What it means |
| --- | --- |
| A thread is a chain | Each checkpoint points to its parent with `parentCheckpointId`. The head is the newest checkpoint of the chain. |
| Ids are unique | A checkpoint id is unique across all threads. |
| Checkpoints never change | Reads return copies. A change to a returned value does not change the store. |
| Ids are valid | Thread ids and checkpoint ids are non-empty, well-formed Unicode strings. Other values throw `SandboxCheckpointInvalidIdError`. |
| A write is all or nothing | Do the checks and the write in one transaction. When a write throws, the store does not change. |
| A write checks its writer first | `writer.threadId` is the thread of the write, and the lease is current. Else the write throws `SandboxCheckpointWriterLostError`. |

2. Implement the required methods:

| Method | What it does |
| --- | --- |
| `get(id)` | Returns the checkpoint, or `null`. A missing id does not throw. |
| `list(threadId)` | Returns all checkpoints of the thread, also the ones off the head chain. Sort by `createdAt`, then by the UTF-8 bytes of the id. An unknown thread returns `[]`. |
| `getHead(threadId)` | Returns the head id, or `null`. |
| `append({ checkpoint, expectedHeadId, writer })` | Adds the checkpoint and makes it the head, as one compare-and-swap. Then adds 1 to the count of each distinct blob key. |
| `deleteHead({ threadId, checkpointId, writer })` | Removes the head and moves the head to its parent. Subtracts 1 from each blob count, and forgets a key at 0. A checkpoint that is not the head throws `SandboxCheckpointNotHeadError`. |
| `acquireWriter(threadId)` | Takes the writer lease of the thread. It does not wait. |
| `listBlobReferences()` | Returns each blob key with a count above 0, for all threads, sorted by UTF-8 bytes. |

`append` runs its checks in this order. Each failed check throws and changes nothing:

| Order | Check | Error |
| --- | --- | --- |
| 1 | The ids are valid. | `SandboxCheckpointInvalidIdError` |
| 2 | `files`, `artifacts`, and a finite `createdAt` are valid. | `SandboxCheckpointInvalidEntryError` |
| 3 | The writer is current. | `SandboxCheckpointWriterLostError` |
| 4 | The id is not used in any thread. | `SandboxCheckpointDuplicateIdError` |
| 5 | The head is `expectedHeadId` (`null` for an empty thread). | `SandboxCheckpointConflictError` |
| 6 | `parentCheckpointId` is `expectedHeadId`. A missing parent id counts as `null`. | `SandboxCheckpointParentMismatchError` |

The blob keys of a checkpoint are the `blobKey` of each `file` entry and of each artifact. Directories and symlinks have no blob. A checkpoint that uses one key two times counts one time.

3. Give `acquireWriter` these lease rules:

- An unexpired lease of the thread throws `SandboxCheckpointWriterConflictError`. An expired lease can be taken over.
- Each new lease gets a new `ownerToken` and a `fence` that is higher than all earlier fences of the thread.
- `renew()` moves `expiresAt` to now plus the lease duration. It throws `SandboxCheckpointWriterLostError` when the lease expired or was replaced.
- `release()` ends the lease. It does nothing when a newer lease replaced it, and it never throws.
- `renewAfterMs` is shorter than the lease duration. The in-memory store uses a lease of 120 seconds.

4. Prove the store with the conformance suite. The suite passes a clock (`now`) and lease times to your factory. Use them in your store, so the lease tests can move the time.

```ts
// checkpoint-store.test.ts
import { runSandboxCheckpointStoreConformance } from '@tanstack/ai-sandbox/testkit'
import { createCheckpointStore } from './checkpoint-store'
import { freshDb } from './test-db'

runSandboxCheckpointStoreConformance(
  'sql',
  async (options) => createCheckpointStore(await freshDb(), options),
  { now: () => 1_000, leaseDurationMs: 100, renewAfterMs: 25 },
)
```

When the suite passes, your store keeps the same promises as the in-memory store.

## Optional methods

- **`deleteCheckpoints`:** removes old checkpoints of a thread. See [Keep only the newest checkpoints](#keep-only-the-newest-checkpoints). The conformance suite skips its tests when your store does not have it.
- **`forkFromCheckpoint`:** copies one checkpoint into a new, empty thread. Without it, the store cannot fork. Prove it with `runSandboxCheckpointForkConformance`.

## Prove the instance store

The `SandboxInstanceStore` keeps the provider sandbox of each key. On Cloudflare, `latestSnapshotId` can keep the backup id from [Your Own Cloudflare Container](./cloudflare-container#save-the-workspace-to-r2).

- `get` returns the fields as you stored them. An optional field that you did not store is absent, not `undefined` and not `null`.
- `upsert` replaces the full record of `record.key`. The last write wins, and no other record changes.

```ts
// instance-store.test.ts
import { runSandboxInstanceStoreConformance } from '@tanstack/ai-sandbox/testkit'
import { createInstanceStore } from './instance-store'
import { freshDb } from './test-db'

runSandboxInstanceStoreConformance('sql', async () =>
  createInstanceStore(await freshDb()),
)
```

For the table and the other rules, see [Build a Sandbox Adapter](../persistence/build-a-sandbox-adapter#sandboxinstancestore-rules).

## Keep only the newest checkpoints

`deleteCheckpoints` keeps the head and the newest checkpoints before it. It needs the writer lease of the thread:

```ts
// prune.ts
import type { SandboxCheckpointStore } from '@tanstack/ai-sandbox'

export async function keepNewest(
  checkpoints: SandboxCheckpointStore,
  threadId: string,
  keep: number,
) {
  if (!checkpoints.deleteCheckpoints)
    throw new Error('This store cannot delete checkpoints')
  const writer = await checkpoints.acquireWriter(threadId)
  try {
    const { deleted } = await checkpoints.deleteCheckpoints({
      threadId,
      keep,
      writer,
    })
    return deleted
  } finally {
    await writer.release()
  }
}
```

- `keep` is a safe integer of 1 or more. Else it throws `SandboxCheckpointInvalidEntryError`.
- "Newest" follows the parent chain from the head, not `createdAt`. Checkpoints off the head chain stay.
- It returns the removed ids, oldest first. The blob counts of the removed checkpoints go down.
- While a run or a capture holds the lease, `acquireWriter` throws `SandboxCheckpointWriterConflictError`.

## Delete blobs that no checkpoint uses

`sweepSandboxBlobs` lists the blob keys under `sandbox-files/` and `sandbox-artifacts/`. It deletes each key that no checkpoint uses and that is older than `olderThanMs`. Other keys in the bucket stay.

Run the sweep at a time with no captures, for example from a nightly cron. A capture does not upload a blob that already exists. So a capture during the sweep can use a blob that the sweep deletes.

```ts
// src/worker.ts
import { sweepSandboxBlobs } from '@tanstack/ai-sandbox'
import { createCheckpointStore } from './checkpoint-store'

// R2 returns pages of keys. The sweep needs all of them.
async function listAll(bucket: R2Bucket, prefix: string) {
  const found: Array<{ key: string; uploadedAt: number }> = []
  let cursor: string | undefined
  for (;;) {
    const page = await bucket.list({ prefix, cursor })
    for (const object of page.objects) {
      found.push({ key: object.key, uploadedAt: object.uploaded.getTime() })
    }
    if (!page.truncated) return found
    cursor = page.cursor
  }
}

export default {
  async scheduled(_controller, env) {
    const deleted = await sweepSandboxBlobs({
      checkpoints: createCheckpointStore(env.DB),
      blobs: {
        list: (prefix) => listAll(env.BLOBS, prefix),
        delete: (key) => env.BLOBS.delete(key),
      },
      // Longer than your longest capture.
      olderThanMs: 24 * 60 * 60 * 1000,
    })
    console.log(`Deleted ${deleted.length} blobs`)
  },
} satisfies ExportedHandler<Env>
```

- A capture uploads its blobs first and adds the checkpoint after. Until then, a new blob has no count. Make `olderThanMs` longer than your longest capture, so the sweep keeps that blob.
- `olderThanMs` must be a finite number of 0 or more. Else the sweep throws `RangeError`.
- Call `keepNewest` first, then the sweep. The sweep then also deletes the bytes that only the removed checkpoints used.

The cron log shows the number of deleted blobs, and your bucket keeps only the bytes that a checkpoint still uses.
