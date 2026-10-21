---
title: Providers
id: providers
order: 3
description: "Pick where a TanStack AI sandbox runs (local process, Docker container, Docker Sandboxes microVM, Daytona, Vercel, Sprites, Upstash Box, Blaxel, E2B, boxd, or Railway), install it, and configure it."
---

You need a place for the agent to run. On your laptop you want a fast loop. In production you want real isolation, or a managed cloud VM that you do not run yourself.

A provider is that place. Every provider has the same contract, so your [workspace](./workspace), [policy](./policy), and harness stay the same when you change the provider.

## Set up a provider

1. Pick a row from the table.

| Provider | Package | Isolation | Needs |
| --- | --- | --- | --- |
| Local process | `@tanstack/ai-sandbox-local-process` | None (your host) | Nothing. For trusted dev work only. |
| Docker | `@tanstack/ai-sandbox-docker` | Container | Docker running. |
| Docker Sandboxes (`sbx`) | `@tanstack/ai-sandbox-docker` | microVM | The `sbx` CLI, `sbx login`, and a hypervisor. |
| [Daytona](https://www.daytona.io/) | `@tanstack/ai-sandbox-daytona` | Cloud sandbox | `DAYTONA_API_KEY` |
| [Vercel](https://vercel.com/docs/sandbox) | `@tanstack/ai-sandbox-vercel` | microVM | `VERCEL_TOKEN`, a team, and a project. |
| [Sprites](https://sprites.dev) | `@tanstack/ai-sandbox-sprites` | Stateful sandbox | `SPRITES_API_KEY` |
| [Upstash Box](https://github.com/upstash/box) | `@tanstack/ai-sandbox-upstash-box` | Cloud sandbox | `UPSTASH_BOX_API_KEY` |
| [Blaxel](https://blaxel.ai) | `@tanstack/ai-sandbox-blaxel` | Cloud sandbox | `BL_API_KEY` and `BL_WORKSPACE`, or a Blaxel CLI login. |
| [E2B](https://e2b.dev) | `@tanstack/ai-sandbox-e2b` | microVM | `E2B_API_KEY` |
| [boxd](https://boxd.sh) | `@tanstack/ai-sandbox-boxd` | microVM | `BOXD_API_KEY` and `BOXD_ORG`. |
| [Railway](https://railway.com) | `@tanstack/ai-sandbox-railway` | microVM | `RAILWAY_API_TOKEN` or `RAILWAY_TOKEN`, and an environment. |

2. Install its package. This example installs the Docker provider. Use the package from your row.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-sandbox-docker
vue: @tanstack/ai-sandbox-docker
solid: @tanstack/ai-sandbox-docker
svelte: @tanstack/ai-sandbox-docker
preact: @tanstack/ai-sandbox-docker
angular: @tanstack/ai-sandbox-docker
vanilla: @tanstack/ai-sandbox-docker
octane: @tanstack/ai-sandbox-docker

<!-- ::end:tabs -->

3. Set the env vars from the "Needs" column.

4. Pass the provider to `defineSandbox`:

```ts
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

export const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: ['corepack enable', 'pnpm install'],
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? '',
    }),
  }),
})
```

To change the provider, change only the `provider` line. Here is the constructor for each one:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { dockerSandbox, sbxSandbox } from '@tanstack/ai-sandbox-docker'
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'
import { spritesSandbox } from '@tanstack/ai-sandbox-sprites'
import { upstashBoxSandbox } from '@tanstack/ai-sandbox-upstash-box'
import { blaxelSandbox } from '@tanstack/ai-sandbox-blaxel'
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'
import { boxdSandbox } from '@tanstack/ai-sandbox-boxd'
import { railwaySandbox } from '@tanstack/ai-sandbox-railway'

const dev = localProcessSandbox() // runs on your host
const isolated = dockerSandbox({ image: 'node:22' }) // container
const microvm = sbxSandbox() // Docker Sandboxes microVM
const daytona = daytonaSandbox({ apiKey: process.env.DAYTONA_API_KEY })
const vercel = vercelSandbox({ runtime: 'node24' })
const sprites = spritesSandbox({ apiKey: process.env.SPRITES_API_KEY })
const box = upstashBoxSandbox({ apiKey: process.env.UPSTASH_BOX_API_KEY })
const blaxel = blaxelSandbox() // uses the API key or the CLI login
const e2b = e2bSandbox() // reads E2B_API_KEY
const boxd = boxdSandbox({ org: 'acme' }) // reads BOXD_API_KEY
const railway = railwaySandbox() // reads RAILWAY_TOKEN and RAILWAY_ENVIRONMENT_ID
```

`dockerSandbox()` and `sbxSandbox()` come from the same package. Every other provider has its own package. For the edge, see [Cloudflare](./cloudflare).

## How it works

- The provider decides **where** the agent runs. The [harness](./harnesses) decides **which** agent runs.
- The provider does not pick how the agent signs in. Set `authMode` on the harness. See [Harness Auth](./auth).
- Isolated and cloud providers have no host CLI login. Pass API keys as workspace secrets there.
- Provider-native snapshots and resume keep or recreate the provider state. They make bootstrap faster. [Portable Snapshots](./portable-snapshots) store finished files in your own persistence.

> [!NOTE]
> Cloud providers (Daytona, Vercel, Sprites, Upstash Box, Blaxel, E2B, boxd, and Railway) run remotely. When you drive them from your laptop, [bridged tools](./tools) cannot reach your `localhost`. Use the ngrok bridge tunnel from the [tools guide](./tools), or see [Cloudflare](./cloudflare) for the edge setup.

## Capabilities

Each provider reports what it can do with `capabilities()`. Code that needs an optional capability checks the flag first:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const provider = localProcessSandbox()

if (provider.capabilities().snapshots) {
  // This provider can take a snapshot.
} else {
  // Skip the snapshot. Local process has no snapshots.
}
```

| Capability | Meaning |
| --- | --- |
| `fs` | Read and write the sandbox filesystem. |
| `exec` | Run commands. |
| `env` | Inject environment variables. |
| `ports` | Expose ports (preview URLs). |
| `backgroundProcesses` | Keep long-running processes alive between calls. |
| `writableStdin` | A spawned process has a writable stdin from the host. |
| `killableProcesses` | A spawned process can be stopped with `SpawnHandle.kill()` and with the `signal` passed to `spawn`. |
| `snapshots` | Take and restore point-in-time snapshots. |
| `networkPolicy` | Enforce network allow and deny rules. |
| `durableFilesystem` | The disk stays across resumes. |
| `fork` | Create a new sandbox from an existing one. |

The framework checks these flags for you. For example, bootstrap takes a snapshot only when `snapshots` is `true`, so `localProcessSandbox` skips that step. If you call an unsupported optional method directly, it throws an `UnsupportedCapabilityError`.

Branch on the flag, not on the provider name. Then your code keeps working when you change the provider.

### `killableProcesses` across the bundled providers

The [run journal](./journal) reads this flag to decide how to read a run's output. It also limits what a cancel can do. On a `false` provider, cancel destroys the sandbox. See [what cancel means on a provider that cannot kill](./takeover#what-cancel-means-on-a-provider-that-cannot-kill).

| Provider | `killableProcesses` |
| --- | --- |
| Local process | `true` |
| Docker | `true` |
| Docker Sandboxes (`sbx`) | `false` |
| Daytona | `false` |
| Vercel | `false` |
| Sprites | `true` (not verified) |
| Upstash Box | `true` |
| Blaxel | `true` |
| E2B | `true` |
| Cloudflare | `false` |
| boxd | `true` |
| Railway | `true` |

A bring-your-own provider must set this flag too. For the reason behind each value, see [Providers (Advanced)](./providers-advanced#killableprocesses-per-provider).

## Advanced

Each provider has its own options and limits: idle timers, ports, network rules, non-root users, and snapshot behavior. Read them in [Providers (Advanced)](./providers-advanced) before you go to production.
