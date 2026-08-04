---
title: Build a Sandbox Adapter (Advanced)
id: sandbox-build-an-adapter
order: 15
description: "Choose what a sandboxed run leaves behind: everything, only the sandbox side, or only the conversation. Then implement the sandbox store and prove it with the conformance suite."
keywords:
  - SandboxInstanceStore
  - withSandbox persistence
  - store sandbox runs
  - sandbox conformance suite
  - defineSandboxInstanceStore
---

# Build a Sandbox Adapter

Your agent runs in a sandbox, and you have to decide what survives a server
restart, a second replica, or a user closing the tab. The answer is not one switch.
A sandboxed run has two halves that persist separately:

- **The sandbox side.** Which provider sandbox to resume for a thread, whether a run
  is still going, and the run's event log.
- **The conversation.** The messages your UI paints when someone reopens a thread.

You can keep both, either one, or neither. This page is the sandbox side, plus the
one place the two meet. Nothing here needs the chat or generation store contracts.

## Decide what you store

| You keep | Wire | You get | You give up |
| --- | --- | --- | --- |
| Everything | `withPersistence` + `withSandbox` with `instances`, `runs`, `durability` | Reopen a thread on any device and see the transcript, the tool cards, and a run still in flight | Store size: one run's tool output can be hundreds of kilobytes |
| Sandbox only | `withSandbox` with `instances`, `runs`, `durability`, and no message store | Runs survive a refresh and can be taken over; sandboxes are reused instead of rebuilt | No transcript. A returning client sees the live remainder, not the history |
| Chat only | `withPersistence` alone | The conversation comes back | No sandbox reuse and no takeover. A disconnect destroys the sandbox |
| Neither | Neither middleware | Nothing to operate | Every run starts from a cold sandbox and dies with its socket |

"Sandbox only" is the posture to reach for when the text itself is sensitive. Run
records and the instance map hold ids and timestamps, not what anyone typed.

There is a finer knob inside a stored transcript, because the harness's tool calls
are stored as messages: keep them and reopening a thread rebuilds the tool cards,
or drop them and keep the conversation alone. See
[Trim what you keep](./events#trim-what-you-keep).

## Keep everything

`withPersistence` owns the conversation. `withSandbox` owns the sandbox. They meet at
one place: **pass the same `RunStore` to both**, so one record describes the run
instead of two that disagree.

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

Add `durability` to make the run detachable and replayable; that is
[Takeover & Detached Runs](./takeover).

## Keep only the sandbox side

Drop `withPersistence` and the sandbox half still works. It needs two stores of its
own, and neither is a chat store:

- a `RunStore`, which is a core contract, not a persistence-package one.
- a `SandboxInstanceStore`, which is the sandbox's own (see below).

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

A returning client can find the run (`findActiveRun`) and tail its remainder. It
cannot repaint what came before, because nothing stored it.

## Keep only the conversation

`withPersistence` alone. Leave `instances`, `runs` and `durability` off `withSandbox`
and it keeps today's simplest behavior: a fresh sandbox per run, destroyed when the
socket closes. Nothing to implement on the sandbox side at all.

## Implement `SandboxInstanceStore`

This is the sandbox's own contract: a map from a compound key to the provider sandbox
that should be resumed. Three methods, and each one has an invariant the conformance
suite checks.

```ts
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

| Method | Invariant |
| --- | --- |
| `get` | A missing key returns `null`. It does not throw. |
| `upsert` | **Full replace** by `record.key`. Omitted optionals clear prior values. |
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

Put it in the same database as your chat tables if you like. That is your choice, not
a requirement: the sandbox never reads a chat table and chat never reads this one.

`updated_at` is yours to sweep on. The library never deletes rows on a schedule, so
old placements are garbage you collect (see [Reaping & Retention](./reaping)).

Hand it to the middleware, or provide it ambiently when a platform layer owns the
wiring:

```ts
import { withSandbox } from '@tanstack/ai-sandbox'
import { instances } from './instances'
import { sandbox } from './sandbox'

export const middleware = [withSandbox(sandbox, { instances })]
```

## Prove it with the conformance suite

Do not hand-write these assertions. `@tanstack/ai-sandbox/testkit` ships the suite
that pins every invariant above, including the full-replace rule that is easy to get
wrong with an `INSERT ... ON CONFLICT DO UPDATE`:

```ts
import { runSandboxInstanceStoreConformance } from '@tanstack/ai-sandbox/testkit'
import { freshDb } from './test-db'

runSandboxInstanceStoreConformance('postgres', async () => {
  const db = await freshDb()
  return db.sandboxInstances
})
```

Three more suites cover the durable-run path, each aimed at one failure that is
painful to find by hand:

- `runJournalConformance`: the agent's output survives as a file a successor can
  replay. See [The Run Journal](./journal).
- `runTakeoverConformance`: a second host adopts a detached run and delivers the
  remainder exactly once. See [Takeover & Detached Runs](./takeover).
- `runReaperConformance`: a run nobody came back for is finalized or expired, and a
  still-producing one is left alone. See [Reaping & Retention](./reaping).

## Where to go next

- [Sandbox Instance Durability](./durability) has the wiring and the locking rules
  for the store you just built.
- [Events](./events) covers what a stored transcript holds, and how to trim it.
- [Durable Runs Explained](./durable-runs) is the same subject in plain language with
  no code, if the postures above felt abrupt.
