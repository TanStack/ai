---
title: Let the Agent Save and Fork
id: portable-snapshots-tools
order: 17
description: "Give a chat() run host tools that save and fork this thread without letting the model pick thread ids."
---

You want the agent to mark a version or open a new direction. The route already
knows `threadId` and `runId`. `createSnapshotTools` turns those values into
host tools that you spread into `chat()`.

The model can pass a label or a checkpoint id on this thread. It cannot pass a
thread id. Your factory mints every new thread id.

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withPersistence } from '@tanstack/ai-persistence'
import { createSnapshotTools, withSandbox } from '@tanstack/ai-sandbox'
import { instances, sandbox, snapshots } from './sandbox-server'

export function POST(threadId: string, runId: string) {
  return chat({
    threadId,
    runId,
    adapter: grokBuildText('composer-2.5'),
    messages: [{ role: 'user', content: 'Save this, then try a dark theme.' }],
    tools: [
      ...createSnapshotTools(snapshots, {
        threadId,
        runId,
        createThreadId: () => crypto.randomUUID(),
        onForked({ destinationThreadId }) {
          void destinationThreadId
        },
      }),
    ],
    middleware: [
      withPersistence(snapshots.persistence),
      withSandbox(sandbox, { instances, snapshots }),
    ],
  })
}
```

The tools run on the server. In a sandbox chat they are bridged back to the
host. See [Tools](./tools).

## What each tool does

- `save_sandbox_snapshot`: saves the live sandbox for the bound thread. The
  model passes `label` only.
- `fork_sandbox_snapshot`: copies one checkpoint into a new empty thread. The
  model can pass `checkpointId`. When it omits that id, the tool copies the
  latest checkpoint. `createThreadId()` sets the destination thread id.
- `read_sandbox_snapshot_artifact`: returns artifact metadata for a checkpoint
  on this thread. It does not return file bytes. Serve bytes from
  [Send a Frozen File](./portable-snapshots-artifacts).

`onForked` runs after a successful fork. If you want the new branch to work
right away, start `chat()` on `destinationThreadId` in that callback.

## When save and fork run

`save_sandbox_snapshot` takes the writer lease for this thread. If this
`chat()` already holds that lease through portable snapshots, the save fails
with `SANDBOX_SNAPSHOT_WRITER_CONFLICT`. Save from a planner thread, or after
this run ends.

`fork_sandbox_snapshot` takes the writer lease on the **new** thread. A fork
during this run can succeed. It copies a saved checkpoint. It does not copy
files the agent is still writing.

See [Keep Files After Reload](./portable-snapshots-configure) to create the
`snapshots` object. See [Save a Named Version](./portable-snapshots-save) and
[Branch From a Version](./portable-snapshots-fork) for routes that you call
yourself.
