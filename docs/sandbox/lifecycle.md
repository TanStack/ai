---
title: Lifecycle & Snapshots
id: lifecycle
order: 8
description: "Reuse sandboxes per thread, snapshot after setup, resume to cut cold-start cost."
---

If bootstrap is too slow → pay it once: reuse per thread, snapshot after setup, resume next run.

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
    snapshot: 'after-setup',
    keepAlive: '30m',
    destroyOnComplete: false,
  },
})
```

## Lifecycle fields

| Field | Controls |
| --- | --- |
| `reuse` | `'thread'` = one sandbox per `threadId`; `'none'` = fresh every run |
| `snapshot` | `'after-setup'` when provider supports snapshots |
| `keepAlive` | Warmth hint (`'30m'`); not read by core today — for providers/apps with idle GC |
| `destroyOnComplete` | `false` keeps sandbox for the next run |
| `snapshotMaxAge` | Stale after duration (`'24h'`) → re-bootstrap |

### Completion ≠ cancel ≠ disconnect

| Event | Sandbox |
| --- | --- |
| Successful finish | Honors `keepAlive` / `destroyOnComplete` |
| Explicit cancel | **Always destroys** (closing the IO pipe does not kill the agent) |
| Disconnect, durability on | Detach — stay up for [takeover](./takeover#detach-vs-cancel) |
| Disconnect, no durability | Destroy (same as abort) |

## Snapshot after setup

On snapshot-capable providers (e.g. [Docker](./providers)), bootstrap snapshots after `setup`. Default is `'after-setup'` when supported; unsupported providers skip silently.

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
    snapshot: 'after-setup',
    snapshotMaxAge: '24h',
  },
})
```

Unset `snapshotMaxAge` → keep snapshots indefinitely.

## Instance key

```txt
sandboxInstanceKey = hash(threadId + sandbox.id + provider + workspaceHash + tenant?)
```

Change repo, setup, image, or tenant → new key → fresh sandbox (no stale resume). Keep inputs stable to hit the warm instance.

## Ensure order

1. Resume live sandbox for the key.
2. Restore latest snapshot (skip setup).
3. Create + bootstrap + snapshot.

Providers without durable disk/snapshots re-create under the same identity and re-pay bootstrap. Support matrix → [Providers](./providers).
