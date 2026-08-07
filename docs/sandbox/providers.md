---
title: Providers
id: providers
order: 3
description: "Pick where a sandbox runs: local process, Docker, Daytona, Vercel, or Sprites."
---

If you need to change **where** the agent runs without rewriting workspace/policy → swap the provider.

Every provider implements the same `SandboxProvider` / `SandboxHandle` contract. [Workspace](./workspace) and [policy](./policy) stay provider-agnostic.

> _Which_ agent runs → [Harnesses](./harnesses).

## Choose a provider

| Provider | Package | Isolation | Notes |
| --- | --- | --- | --- |
| Local process | `@tanstack/ai-sandbox-local-process` | none (host) | Fast dev loop. Trusted/dev only. |
| Docker | `@tanstack/ai-sandbox-docker` | container | Snapshots, fork, resume-by-id. |
| Daytona | `@tanstack/ai-sandbox-daytona` | cloud | Resume-by-id, preview ports. Needs `DAYTONA_API_KEY`. |
| Vercel | `@tanstack/ai-sandbox-vercel` | microVM | Durable FS, resume-by-id. Needs `VERCEL_TOKEN` + team/project. |
| Sprites | `@tanstack/ai-sandbox-sprites` | stateful sandbox | Checkpoints, public URL. Needs `SPRITES_API_KEY`. |

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'

const dev = localProcessSandbox()
const isolated = dockerSandbox({ image: 'node:22' })
const daytona = daytonaSandbox({ apiKey: process.env.DAYTONA_API_KEY })
const vercel = vercelSandbox({ runtime: 'node24' })
```

> Cloud providers (Daytona, Vercel, Sprites) are remote VMs. Bridged [tools](./tools) cannot dial laptop `localhost` — tunnel the bridge in local dev. Edge path → [Cloudflare](./cloudflare).

## Local process

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const dev = localProcessSandbox()
```

| Topic | Behavior |
| --- | --- |
| Isolation | None — agent = host process. |
| Auth | Inherits host env; host CLI login works. |
| Snapshots | None; snapshot step skipped silently. |

### Use host CLI login (`scrubEnv`)

Drop an injected API key so the host CLI falls back to its login session:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const hostLogin = localProcessSandbox({ scrubEnv: ['XAI_API_KEY'] })
```

Only local-process can do this. Isolated/cloud providers always need workspace secrets.

### Windows process teardown (`logger`)

On Windows, MSYS fork emulation can leave orphan processes after `taskkill /T` exits `0`. `localProcessSandbox` consults MSYS's process table and kills descendants. Teardown never throws (a throwing kill would strand a run) — pass a `logger` to see kills that fail:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const dev = localProcessSandbox({
  logger: {
    warn: (message, meta) => console.warn(message, meta),
  },
})
```

Any object with `warn(message, meta?)` works. Already-exited processes are not reported. POSIX is unchanged.

## Docker

```ts
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const isolated = dockerSandbox({ image: 'node:22' })
```

- **Isolation:** real container boundary.
- **Auth:** workspace secrets at create/resume. Host tools via `host.docker.internal` ([tools](./tools)).
- **Snapshots:** commit-based snapshots, `fork`, resume-by-id. Bootstrap snapshots after `setup`.

## Daytona

```ts
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'

const daytona = daytonaSandbox({ apiKey: process.env.DAYTONA_API_KEY })
```

- **Isolation:** managed cloud sandbox.
- **Auth:** `DAYTONA_API_KEY` + workspace secrets. No host login.
- **Resume:** resume-by-id to a still-running sandbox (not point-in-time snapshot) + preview links.
- **Bridge:** remote → tunnel in local dev ([tools](./tools)).

## Vercel

```ts
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'

const vercel = vercelSandbox({ runtime: 'node24' })
```

- **Isolation:** managed microVM.
- **Auth:** `VERCEL_TOKEN` + team/project + workspace secrets.
- **Resume:** persistent resume-by-id, durable filesystem, exposed-port domains.
- **Bridge:** remote → tunnel in local dev ([tools](./tools)).

## Sprites

```ts
import { spritesSandbox } from '@tanstack/ai-sandbox-sprites'

const sprites = spritesSandbox({ apiKey: process.env.SPRITES_API_KEY })
```

- **Isolation:** managed [Sprites](https://sprites.dev) (Fly.io) sandbox.
- **Auth:** `SPRITES_API_KEY` (`org/projectNumber/tokenId/secret`); optional `apiUrl` / `SPRITES_API_URL`.
- **Resume:** resume-by-id (durable FS). `snapshot()` → checkpoint; restore is **in-place** via `restoreCheckpoint()` / `listCheckpoints()`. No reconstruct-after-gone `restoreSnapshot` — gone Sprite → fresh create. Restore can take minutes; retry file reads immediately after.
- **Ports:** one proxied HTTP port (default `8080`, via `httpPort`). `ports.connect(8080)` switches public auth and returns the URL.
- **Bridge:** remote → tunnel in local dev ([tools](./tools)).

## Capabilities

Providers declare support via `capabilities()`. Code checks flags and degrades; calling an unsupported method throws `UnsupportedCapabilityError`.

| Capability | Meaning |
| --- | --- |
| `fs` / `exec` / `env` | Filesystem, commands, env injection |
| `ports` | Preview URLs |
| `backgroundProcesses` | Long-lived processes between calls |
| `writableStdin` | Host→process stdin (`true` local/Docker; `false` remote/edge) |
| `killableProcesses` | `SpawnHandle.kill()` + mid-flight abort via `signal` |
| `snapshots` / `fork` / `durableFilesystem` | Point-in-time restore, branch, durable disk |
| `networkPolicy` | Network allow/deny |

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const provider = localProcessSandbox()
const caps = provider.capabilities()

if (caps.snapshots) {
  // take a snapshot
} else {
  // local-process has none
}
```

### `killableProcesses` (measured)

Wrong `true` leaks an unstoppable `tail -f` per run. Providers declare it only when kill is observed on a real sandbox. Required on every provider (omit → treated as killable = dangerous default).

| Provider | Flag | Why |
| --- | --- | --- |
| Local process | `true` | Kills process **group** (POSIX `-pid`; Windows `taskkill /T` + MSYS sweep). |
| Docker | `true` | Signals pid **inside** container; stream destroy alone is not enough. |
| Daytona | `false` | `kill()` aborts client poll only; unmeasured. |
| Vercel | `false` | Server-side kill unmeasured against forked children. |
| Sprites | `true` (unverified) | Real `POST …/kill`; signal scope unmeasured. |
| Cloudflare | `false` | `kill()` no-op; Workers RPC cannot serialize `AbortSignal`. |

**Cause → fix:** [journal](./journal) uses `follow` when killable, `poll` when not. On `false`, cancel only works by **destroying the sandbox** — see [takeover](./takeover#what-cancel-means-on-a-provider-that-cannot-kill).
