---
title: Lifecycle & Snapshots
id: lifecycle
order: 8
description: "Control sandbox reuse, snapshot the bootstrapped workspace after setup, and resume across runs to cut cold-start cost."
---

Bootstrapping a sandbox (cloning the repo, installing dependencies, running
`setup`) is the expensive part of a run. The lifecycle config lets you pay that
cost once and reuse the result: keep one sandbox per thread, snapshot it after
setup, and resume instead of re-bootstrapping on the next run.

```ts
import { defineSandbox, defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['corepack enable', 'pnpm install'],
  }),
  lifecycle: {
    reuse: 'thread',          // one sandbox per threadId ('none' = fresh per run)
    snapshot: 'after-setup',  // snapshot once bootstrapped (provider-permitting)
    keepAlive: '30m',         // hint to keep the sandbox warm between runs
    destroyOnComplete: false, // keep it for the next run
  },
})
```

## The lifecycle object

| Field               | What it controls                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `reuse`             | `'thread'` keeps one sandbox per `threadId`; `'none'` provisions a fresh sandbox per run.    |
| `snapshot`          | `'after-setup'` snapshots the workspace once bootstrap finishes, on snapshot-capable providers. |
| `keepAlive`         | Duration hint (e.g. `'30m'`) for how long the sandbox should stay warm between runs. Nothing in `@tanstack/ai-sandbox` reads it today; it is carried for providers and host apps that implement their own idle GC. |
| `destroyOnComplete` | When `false`, the sandbox survives the run so the next one can resume it.                    |
| `snapshotMaxAge`    | Duration (e.g. `'24h'`) after which a stored snapshot is treated as stale and re-created.   |

### These fields govern *completion*, not cancellation

`keepAlive` and `destroyOnComplete` describe what happens when a run **finishes**.
They never keep a sandbox alive through an abort: closing the agent's IO stream
does not kill the agent process, so an explicit cancel destroys the sandbox
regardless of `destroyOnComplete`, and that is the only reliable way to stop the
agent burning tokens.

A **disconnect** is the third case, and it is not the same as a cancel. A user
pressing Stop and a user closing the tab produce an identical connection close.
On a run with durability wired, a disconnect neither completes nor destroys: the
sandbox stays up, the agent keeps working, and the run record is marked detached
so a later request can take it over. With no durability wired, a disconnect
destroys, exactly as an abort does. See
[Takeover & Detached Runs](./takeover#detach-vs-cancel).

## Snapshot after setup

When the provider supports snapshots (e.g. [Docker](./providers)), bootstrap
automatically takes a snapshot after `setup` completes. The snapshot caches the
fully bootstrapped [workspace](./workspace) (the cloned repo with dependencies
installed) so subsequent runs resume from it instead of re-running the setup
steps, which dramatically reduces cold-start time.

`snapshot: 'after-setup'` is the default whenever the provider reports snapshot
support, so you usually do not set it explicitly. Providers without snapshot
support (e.g. `localProcessSandbox`) skip the snapshot step silently.

```ts
import { defineSandbox, defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['corepack enable', 'pnpm install'],
  }),
  lifecycle: {
    reuse: 'thread',
    // 'after-setup' is the default when the provider supports snapshots.
    snapshot: 'after-setup',
    // Optional: re-create (re-bootstrap) when the snapshot is older than this.
    snapshotMaxAge: '24h',
  },
})
```

### Stale snapshots

`snapshotMaxAge` accepts a duration string (`'24h'`, `'30m'`, etc.). When the
stored snapshot is older than the limit, the sandbox treats it as stale and
re-creates from scratch, re-running setup and capturing a new snapshot. Leave
it unset to keep snapshots indefinitely.

## The sandbox instance key

A sandbox is keyed by a compound `sandboxInstanceKey`:

```txt
sandboxInstanceKey = hash(threadId + sandbox.id + provider + workspaceHash + tenant?)
```

Because the key folds in the workspace hash, the provider, and an optional
tenant. Changing any input that would invalidate a cached environment means the
repo, the `setup` steps, the provider image, or the tenant, produces a
different key. That means you safely start a **fresh** sandbox rather than
resuming a stale one whose snapshot no longer matches your config. Keep those
inputs stable across runs to keep hitting the same warm sandbox.

## Ensure order

When a run needs a sandbox, the layer resolves it in this order:

1. **Resume the running sandbox**, if a live sandbox already exists for the key.
2. **Restore the latest snapshot**, recreate from the most recent snapshot,
   skipping setup.
3. **Create fresh and bootstrap**, clone, install, run `setup`, then snapshot.

Each step falls through to the next only when the prior one is unavailable. This
is what turns a warm thread into a near-instant start, and a cold one into a
full bootstrap.

> Which providers support durable disk, snapshots, and resume-by-id is listed on
> [Providers](./providers).

Providers without durable disk or snapshots (e.g. ephemeral containers)
re-create and re-bootstrap under the same identity: the `sandboxInstanceKey`
stays stable, but every run pays the bootstrap cost because there is nothing
durable to resume.
