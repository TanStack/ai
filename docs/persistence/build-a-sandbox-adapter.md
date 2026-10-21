---
title: Build a Sandbox Adapter (Advanced)
id: sandbox-build-an-adapter
order: 15
description: "Choose what a sandboxed run leaves behind: everything, only the sandbox side, or only the conversation. Then write the sandbox store and prove it with the conformance suite."
keywords:
  - SandboxInstanceStore
  - withSandbox persistence
  - store sandbox runs
  - sandbox conformance suite
  - defineSandboxInstanceStore
---

Your agent runs in a sandbox. The server restarts, a second replica takes a
request, or the user closes the tab. What survives?

A sandboxed run has two halves, and each one persists on its own:

- **The sandbox side.** Which provider sandbox to resume for a thread, if a run
  is still going, and the event log of the run.
- **The conversation.** The messages that your UI shows when someone opens a
  thread again.

You can keep both, one, or neither. This page builds the sandbox side and the
one place where the two halves meet. It needs no chat or generation store
contract.

To rebuild completed workspace files after the provider sandbox is gone, use
[Keep Files After Reload](../sandbox/portable-snapshots-configure). Pass it the
same persistence object that `withPersistence` uses.

## Quick setup: keep everything

1. Write a `SandboxInstanceStore`. It maps a key to the provider sandbox to
   resume. Replace `db` with your own database handle:

   ```ts
   // instances.ts
   import { defineSandboxInstanceStore } from '@tanstack/ai-sandbox'
   import { db } from './db'

   export const instances = defineSandboxInstanceStore({
     // A missing key returns null. It never throws.
     get: (key) => db.sandboxInstances.findByKey(key),

     // A FULL replace, not a merge: omitted optional fields must clear the stored
     // value, or a create-without-snapshot leaves a stale `latestSnapshotId` behind
     // and `ensure` resumes from a snapshot that no longer describes the workspace.
     upsert: (record) => db.sandboxInstances.replace(record),

     // Deleting a key that is not there is a no-op.
     delete: (key) => db.sandboxInstances.remove(key),
   })
   ```

2. Add `withPersistence` and `withSandbox` to the run. Pass the **same
   `RunStore`** to both, so one record describes the run:

   ```ts
   import { chat } from '@tanstack/ai'
   import { withLocks } from '@tanstack/ai/locks'
   import { claudeCodeText } from '@tanstack/ai-claude-code'
   import { withPersistence } from '@tanstack/ai-persistence'
   import { withSandbox } from '@tanstack/ai-sandbox'
   // Your stores and your `defineSandbox(...)` result.
   import { persistence } from './persistence'
   import { instances } from './instances'
   import { locks } from './locks'
   import { sandbox } from './sandbox'

   export function agentRun(input: {
     messages: Array<{ role: 'user'; content: string }>
     threadId: string
     runId: string
   }) {
     return chat({
       adapter: claudeCodeText('claude-opus-4-8'),
       messages: input.messages,
       threadId: input.threadId,
       runId: input.runId,
       middleware: [
         withPersistence(persistence),
         // Before `withSandbox`: it serializes resume-or-create for one key.
         withLocks(locks),
         withSandbox(sandbox, {
           instances,
           // The SAME store chat persistence uses.
           runs: persistence.stores.runs,
         }),
       ],
     })
   }
   ```

3. Prove the store with the conformance suite:

   ```ts
   import { runSandboxInstanceStoreConformance } from '@tanstack/ai-sandbox/testkit'
   import { freshDb } from './test-db'

   runSandboxInstanceStoreConformance('postgres', async () => {
     const db = await freshDb()
     return db.sandboxInstances
   })
   ```

Start a run, then start a second run on the same thread. The second run reuses
the provider sandbox of the first run, because the instance store kept its id.

To make the run detachable and replayable, add `durability` to `withSandbox`.
See [Takeover & Detached Runs](../sandbox/takeover).

## How it works

- `withSandbox` builds a compound key from the thread and the sandbox setup. It
  reads `instances` to find the provider sandbox for that key, and it writes a
  record when it creates or resumes one.
- `withLocks` makes sure that only one request runs resume-or-create for a key
  at a time.
- `withPersistence` owns the conversation. `withSandbox` owns the sandbox.
  Because they share one `RunStore`, the run status never disagrees between
  them.

## Decide what you store

| You keep | Wire | You get | You give up |
| --- | --- | --- | --- |
| Everything | `withPersistence` + `withSandbox` with `instances`, `runs`, `durability` | Open a thread on any device and see the transcript, the tool cards, and a run still in flight | Store size: the tool output of one run can be hundreds of kilobytes |
| Sandbox only | `withSandbox` with `instances`, `runs`, `durability`, and no message store | Runs survive a refresh and can be taken over. Sandboxes are reused, not rebuilt | No transcript. A returning client sees the live remainder, not the history |
| Chat only | `withPersistence` alone | The conversation comes back | No sandbox reuse and no takeover. A disconnect destroys the sandbox |
| Neither | Neither middleware | Nothing to operate | Every run starts from a cold sandbox and stops with its socket |

Use "Sandbox only" when the text itself is sensitive. Run records and the
instance map hold ids and timestamps, not what anyone typed.

A stored transcript has one more setting. The tool calls of the harness are
stored as messages:

- Keep them, and opening a thread again rebuilds the tool cards.
- Drop them, and you keep only the conversation.

See [Trim what you keep](../sandbox/events#trim-what-you-keep).

## Keep only the sandbox side

Remove `withPersistence`, and the sandbox half still works. It needs two stores
of its own, and neither one is a chat store:

- A `RunStore`. This is a core contract from `@tanstack/ai`, not one from the
  persistence package.
- A `SandboxInstanceStore`, the store from the quick setup.

```ts
import { chat } from '@tanstack/ai'
import { withLocks } from '@tanstack/ai/locks'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withSandbox } from '@tanstack/ai-sandbox'
import { instances } from './instances'
import { locks } from './locks'
// Your own `RunStore`. Nothing here stores a message.
import { runs } from './runs'
import { sandbox } from './sandbox'

export function agentRun(input: {
  messages: Array<{ role: 'user'; content: string }>
  threadId: string
  runId: string
}) {
  return chat({
    adapter: claudeCodeText('claude-opus-4-8'),
    messages: input.messages,
    threadId: input.threadId,
    runId: input.runId,
    middleware: [
      withLocks(locks),
      withSandbox(sandbox, { instances, runs }),
    ],
  })
}
```

A returning client can find the run (`findActiveRun`) and tail the rest of it.
It cannot show what came before, because nothing stored it.

## Keep only the conversation

Use `withPersistence` alone. Leave `instances`, `runs`, and `durability` off
`withSandbox`. Each run then gets a fresh sandbox, and the sandbox is destroyed
when the socket closes. You implement nothing on the sandbox side.

## Advanced

### `SandboxInstanceStore` rules

The store has three methods. The conformance suite checks the rule of each one:

| Method | Rule |
| --- | --- |
| `get` | A missing key returns `null`. It does not throw. |
| `upsert` | **Full replace** by `record.key`. Omitted optional fields clear the prior values. |
| `delete` | A missing key is a **no-op**. |
| timestamps | `updatedAt` is epoch **milliseconds**. |

One row per key is enough:

```sql
CREATE TABLE sandbox_instances (
  key                 TEXT PRIMARY KEY,
  provider            TEXT NOT NULL,
  provider_sandbox_id TEXT NOT NULL,
  latest_snapshot_id  TEXT,
  thread_id           TEXT NOT NULL,
  latest_run_id       TEXT,
  updated_at          INTEGER NOT NULL
);
```

You can put this table in the same database as your chat tables, but you do not
have to. The sandbox never reads a chat table, and chat never reads this one.

The library never deletes rows on a schedule. Use `updated_at` to sweep old
rows yourself. See [Reaping & Retention](../sandbox/reaping).

You can pass the store to the middleware, or provide it from a platform layer
that owns the wiring:

```ts
import { withSandbox } from '@tanstack/ai-sandbox'
import { instances } from './instances'
import { sandbox } from './sandbox'

export const middleware = [withSandbox(sandbox, { instances })]
```

### The four run fields

Durable runs add four optional fields to the `RunStore` record that you already
use for chat. Only the sandbox packages write them. A chat-only app can leave
the columns out of its schema.

| Field | Written by | If you drop it |
| --- | --- | --- |
| `sandboxKey` | `withSandbox` on detach | Nothing can find the detached sandbox again, so it is never reclaimed |
| `detachedSince` | `withSandbox` on detach, cleared on re-attach | The reaper cannot tell a run that nobody watches from a live one |
| `cancelRequested` | `requestRunCancel`, out of band | A Stop button cannot reach a run that another replica drives |
| `driverEpoch` | each host that claims the run | Takeover has no fence, so two hosts can drive one run |

`update` must treat an **omitted** key and a key with the value **`undefined`**
differently:

- Omitted means "leave the column alone".
- Explicit `undefined` means "clear it". A viewer that attaches again clears
  `detachedSince` this way.

A backend that filters `undefined` out of its `SET` clause passes every other
test. Then it reports healthy runs as detached forever.

```ts
import type { RunRecord } from '@tanstack/ai'

// One branch of your own `update(runId, patch)`. Key presence, not a value check.
export function detachedSinceColumn(
  patch: Partial<RunRecord>,
  sets: Array<string>,
  params: Array<unknown>,
): void {
  if ('detachedSince' in patch) {
    sets.push('detached_since = ?')
    params.push(patch.detachedSince ?? null)
  }
}
```

Prove the fields with their own suite. It is separate from
`runPersistenceConformance` because most apps never need it:

```ts
import { runDurableRunFieldsConformance } from '@tanstack/ai-sandbox/testkit'
import { persistence } from './persistence'

runDurableRunFieldsConformance('my postgres runs', () => persistence.stores.runs)
```

`listReclaimable` on the same store is also sandbox-only and optional. If you
skip it, `reapDetachedRuns` detects that it is missing, logs one line, and
sweeps nothing. See [Reaping & Retention](../sandbox/reaping).

### More conformance suites

Do not write these assertions by hand. `@tanstack/ai-sandbox/testkit` ships
`runSandboxInstanceStoreConformance` (from the quick setup), which pins every
rule above. That includes the full-replace rule, which is easy to get wrong with
an `INSERT ... ON CONFLICT DO UPDATE`.

Three more suites cover the durable-run path. Each one finds one failure that
is hard to find by hand:

- `runJournalConformance`: the output of the agent survives as a file that a
  successor can replay. See [The Run Journal](../sandbox/journal).
- `runTakeoverConformance`: a second host adopts a detached run and delivers the
  remainder exactly once. See [Takeover & Detached Runs](../sandbox/takeover).
- `runReaperConformance`: a run that nobody came back for is finalized or
  expired, and a run that still produces output is left alone. See
  [Reaping & Retention](../sandbox/reaping).

### Next

- [Sandbox Instance Durability](../sandbox/durability): the wiring and the
  locking rules for this store.
- [Events](../sandbox/events): what a stored transcript holds, and how to trim
  it.
- [Durable Runs Explained](../sandbox/durable-runs): the same subject in plain
  language with no code.
