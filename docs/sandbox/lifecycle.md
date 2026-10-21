---
title: Lifecycle & Snapshots
id: lifecycle
order: 8
description: "Reuse one sandbox per thread, snapshot the workspace after setup, and resume on the next run, so only the first run pays the cold-start cost."
---

Every new sandbox clones the repo, installs dependencies, and runs `setup`. That is the slow part of a run. You do not want to pay it on every message.

The `lifecycle` config lets you pay it once. Keep one sandbox per thread, take a snapshot after setup, and resume on the next run.

## Reuse a sandbox

Add `lifecycle` to `defineSandbox`:

```ts
import { defineSandbox, defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

export const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['corepack enable', 'pnpm install'],
  }),
  lifecycle: {
    reuse: 'thread', // one sandbox per threadId
    snapshot: 'after-setup', // snapshot once bootstrap is done
    snapshotMaxAge: '24h', // make a new one when the snapshot is older
    destroyOnComplete: false, // keep the sandbox for the next run
  },
})
```

Pass the same `threadId` to `chat()` on each run. The first run bootstraps. Later runs resume the sandbox or restore the snapshot, and skip setup.

## The lifecycle fields

| Field | What it controls |
| --- | --- |
| `reuse` | `'thread'` (default) keeps one sandbox per `threadId`. `'none'` makes a fresh sandbox for each run. |
| `snapshot` | `'after-setup'` takes a snapshot when bootstrap ends. `'after-run'` takes one when a run completes. `'none'` takes no snapshot. The default is `'after-setup'` when the provider supports snapshots, else `'none'`. |
| `snapshotMaxAge` | A duration such as `'24h'` or `'30m'`. An older record is treated as stale and created again. |
| `destroyOnComplete` | When `true`, the sandbox is destroyed after the run completes. When `false` (default), the next run can resume it. |
| `keepAlive` | A duration hint such as `'30m'`, for how long to keep the sandbox warm. `@tanstack/ai-sandbox` does not read it. It is a hint for providers and host apps. Provider idle timers are on the [provider](./providers-advanced) config. |

## How it works

When a run needs a sandbox, `withSandbox` tries these in order:

1. **Resume the running sandbox**, if a live one exists for this key.
2. **Restore the latest snapshot**, and skip setup.
3. **Create a fresh sandbox and bootstrap it**: clone, install, run `setup`, then take a snapshot.

Each step falls through to the next only when it is not available. A warm thread starts almost at once. A cold one does the full bootstrap.

Providers without snapshot support (for example `localProcessSandbox`) skip the snapshot step with no error. Providers without a durable disk or snapshots create and bootstrap again on every run. See [Providers (Advanced)](./providers-advanced) for what each provider supports.

> [!NOTE]
> Provider snapshots make bootstrap faster. To keep the finished files after the sandbox is gone, use [Keep Files After Reload](./portable-snapshots-configure). Portable snapshots restore only into a new private sandbox, after the steps above. They never overwrite a live resumed sandbox.

## Advanced

### Stale snapshots

`snapshotMaxAge` takes `'<n>h'` (hours) or `'<n>m'` (minutes). When the stored record is older than this limit, the sandbox is treated as stale. It is created from scratch: setup runs again, and a new snapshot is taken. If you leave it unset, snapshots stay forever.

### The sandbox instance key

A sandbox is found by a compound key:

```txt
sandboxInstanceKey = hash(threadId + sandbox.id + provider + workspaceHash + tenant?)
```

The key includes the workspace hash, the provider, and an optional tenant. So if you change the repo, the `setup` steps, the provider image, or the tenant, you get a different key. That starts a **fresh** sandbox, and you never resume a stale one that does not match your config. Keep those inputs the same across runs to keep hitting the same warm sandbox.

Providers without a durable disk or snapshots (for example ephemeral containers) keep the same key. But every run pays the bootstrap cost, because there is nothing durable to resume.

### Completion, cancel, and disconnect

`keepAlive` and `destroyOnComplete` apply when a run **completes**. They never keep a sandbox alive through an abort.

- **Cancel:** closing the agent's IO stream does not stop the agent process. So an explicit cancel always destroys the sandbox, whatever `destroyOnComplete` says. That is the only sure way to stop the agent from spending tokens.
- **Disconnect:** Stop and a closed tab look the same to the server: the connection closes.
  - With durability wired, a disconnect does not complete or destroy anything. The sandbox stays up, the agent keeps working, and the run record is marked detached. A later request can take it over.
  - With no durability wired, a disconnect destroys the sandbox, the same as an abort.

See [Takeover & Detached Runs](./takeover#detach-vs-cancel) and [Durable Runs](./durable-runs).
