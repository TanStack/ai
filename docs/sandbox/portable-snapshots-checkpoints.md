---
title: Checkpoint at Any Time
id: portable-snapshots-checkpoints
order: 18
description: "Save the sandbox workspace as a checkpoint whenever you want with captureSandboxCheckpoint, and restore it into a new sandbox after a crash with restoreSandboxCheckpoint."
---

Call `captureSandboxCheckpoint` to save the files of a sandbox at any time. After a crash, call `restoreSandboxCheckpoint` on a new sandbox. You lose only the work since the last checkpoint.

Both functions take a `SandboxHandle`. They work with `sandboxWorkspaceBackend`, with every provider, and without `withSandbox`. When you use `withSandbox`, the middleware writes checkpoints for you. See [Keep Files After Reload](./portable-snapshots-configure).

## Add checkpoints to your agent loop

1. Create the two stores. These in-memory stores are for local development.

```ts
// checkpoint-stores.ts
import { memoryPersistence } from '@tanstack/ai-persistence'
import { InMemorySandboxCheckpointStore } from '@tanstack/ai-sandbox'

// The checkpoint list, the head, and the writer lease of each thread.
export const checkpoints = new InMemorySandboxCheckpointStore()

// The file bytes. Any object with `get`, `head`, and `put` works.
export const blobs = memoryPersistence().stores.blobs
```

In production, use a durable checkpoint store and an R2 bucket for `blobs`. See [Store Checkpoints](./portable-snapshots-storage).

2. Start the sandbox and restore the newest checkpoint. Do this before the agent runs, so nothing else writes to the sandbox during the restore.

```ts
// workspace.ts
import { restoreSandboxCheckpoint } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { blobs, checkpoints } from './checkpoint-stores'

const docker = dockerSandbox({ image: 'node:22' })

export async function startWorkspace(threadId: string) {
  const handle = await docker.create({})
  const restored = await restoreSandboxCheckpoint({
    handle,
    checkpoints,
    blobs,
    threadId,
  })
  // `null`: the thread has no checkpoint yet, so the sandbox stays as it is.
  console.log(restored === null ? 'New thread' : `Restored ${restored.id}`)
  return handle
}
```

3. Write a checkpoint function. A second capture of the same thread throws `SandboxCheckpointWriterConflictError` while the first one runs. Skip that capture, because the next one saves the same files.

```ts
// checkpoint.ts
import {
  captureSandboxCheckpoint,
  SandboxCheckpointWriterConflictError,
} from '@tanstack/ai-sandbox'
import type { SandboxHandle } from '@tanstack/ai-sandbox'
import { blobs, checkpoints } from './checkpoint-stores'

export async function checkpoint(handle: SandboxHandle, threadId: string) {
  try {
    const saved = await captureSandboxCheckpoint({
      handle,
      checkpoints,
      blobs,
      threadId,
    })
    return saved.id
  } catch (error) {
    if (error instanceof SandboxCheckpointWriterConflictError) return null
    throw error
  }
}

export function checkpointEveryMinute(handle: SandboxHandle, threadId: string) {
  const timer = setInterval(() => {
    checkpoint(handle, threadId).catch(console.error)
  }, 60_000)
  return () => clearInterval(timer)
}
```

Call `checkpoint` where your loop finishes a step, or start `checkpointEveryMinute`. A capture reads the files one by one. For a consistent set of files, capture between steps, when no command writes to the workspace.

4. Give the sandbox to the coding tools in `bind`:

```ts
// tools.ts
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { sandboxWorkspaceBackend } from '@tanstack/ai-sandbox/harness'
import { checkpointEveryMinute } from './checkpoint'
import { startWorkspace } from './workspace'

export const tools = workspaceTools({
  workspace: {
    bind: async ({ run }) => {
      const handle = await startWorkspace(run.threadId)
      checkpointEveryMinute(handle, run.threadId)
      return {
        ...sandboxWorkspaceBackend(handle, { owned: true }),
        root: handle.workspaceRoot,
      }
    },
  },
})
```

Let the agent write a file, and wait one minute. Then remove the container and start the thread again. `bind` makes a new sandbox, and the file is back.

## Options

`captureSandboxCheckpoint` also takes these options:

| Option | What it does |
| --- | --- |
| `label` | Names the checkpoint. The checkpoint reason is then `named`. |
| `policy` | Picks which files to keep. Pass the same policy to the restore. See [Pick Which Files to Keep](./portable-snapshots-files). |
| `secrets` | Secret values. The capture replaces them with zero bytes in the stored files. |
| `conversation` | Messages to keep with the files. The default is `[]`. |
| `workspaceRoot` | The folder to capture. The default is `/workspace`. |

`restoreSandboxCheckpoint` takes `policy` and `workspaceRoot` too. Pass `checkpointId` to restore an older checkpoint of the thread in place of the newest one.

## Restore rules

- Restore only into a sandbox that no other process writes to during the restore.
- Files in the workspace that are not in the checkpoint are removed. Paths that the policy excludes stay.
- A `checkpointId` that does not exist on the thread throws `SandboxSnapshotError` with code `SANDBOX_SNAPSHOT_MISSING_CHECKPOINT`.

## When a capture fails

- **`SandboxCheckpointWriterConflictError`:** another writer holds the lease of the thread. That writer can be another capture, or a `withSandbox` run on the same thread.
- **`SandboxCheckpointConflictError`:** the head of the thread moved during the capture.
- **`SandboxSnapshotError` with code `SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY`:** the workspace has a link that leaves the workspace, a fifo, a socket, or a device file. Exclude that path. See [Skip a link that leaves the workspace](./portable-snapshots-files#skip-a-link-that-leaves-the-workspace).

## On Cloudflare

Make the handle with [`containerSandbox`](./cloudflare-container) over the container of your Durable Object. Pass your R2 bucket as `blobs`:

```ts ignore
// ignore: needs the Cloudflare Workers runtime types (cloudflare:workers, Env, R2Bucket), which the docs check does not load.
// src/agent-container.ts
import { Files } from '@cloudflare/sandbox'
import { restoreSandboxCheckpoint } from '@tanstack/ai-sandbox'
import { containerSandbox } from '@tanstack/ai-sandbox-cloudflare/container'
import { DurableObject } from 'cloudflare:workers'
import { createCheckpointStore } from './checkpoint-store'

export class AgentContainer extends DurableObject<Env> {
  async start(threadId: string) {
    const container = this.ctx.container
    if (!container) throw new Error('The container binding is not configured')
    if (!container.running) container.start({ enableInternet: false })

    const provider = containerSandbox({ container, files: new Files(container) })
    const handle = await provider.create({ id: threadId })
    await restoreSandboxCheckpoint({
      handle,
      checkpoints: createCheckpointStore(this.env.DB),
      blobs: this.env.BLOBS,
      threadId,
    })
    return handle
  }
}
```

`createCheckpointStore` is your durable store. [Store Checkpoints](./portable-snapshots-storage) shows its rules and the test that proves it.

When the container stops, the next `start` makes a new container, and the files of the last checkpoint are back.
