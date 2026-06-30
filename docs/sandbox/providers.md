---
title: Providers
id: providers
order: 3
description: "Pick and configure where a TanStack AI sandbox runs — local process, Docker, Daytona, or Vercel — and understand the capabilities each one exposes."
---

A provider owns the isolation primitive: where the harness actually runs. Every
provider implements the same `SandboxProvider` / `SandboxHandle` contract, so the
[workspace](./workspace) you hand the agent and the [policy](./policy) that guards
it are provider-agnostic. Pick a provider for the isolation, auth, and
snapshot/resume behaviour you need; the rest of your sandbox definition stays the
same.

> The provider is _where_ the agent runs. For _which_ agent runs — Grok Build,
> Claude Code, Codex, OpenCode, or any ACP agent via `acpCompatible` — see
> [Harnesses](./harnesses).

## Choosing a provider

| Provider | Package | Isolation | Notes |
| --- | --- | --- | --- |
| Local process | `@tanstack/ai-sandbox-local-process` | none (host) | The fast, no-Docker dev loop. Trusted/dev use only. |
| Docker | `@tanstack/ai-sandbox-docker` | container | Real isolation; commit-based snapshots, fork, resume-by-id. |
| Daytona | `@tanstack/ai-sandbox-daytona` | cloud sandbox | Managed [Daytona](https://www.daytona.io/) sandboxes; port preview links, resume-by-id. Needs `DAYTONA_API_KEY`. |
| Vercel | `@tanstack/ai-sandbox-vercel` | microVM | Managed [Vercel Sandbox](https://vercel.com/docs/sandbox) microVMs; exposed-port domains, resume-by-id (persistent). Needs `VERCEL_TOKEN` + team/project. |
| Sprites | `@tanstack/ai-sandbox-sprites` | cloud sandbox | Managed [Sprites](https://sprites.dev) (Fly.io) sandboxes; durable filesystem, single proxied public-URL port, resume-by-id. Needs `SPRITES_API_KEY`. |

Each provider is its own package, and the constructor is the only thing that
differs between them:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'

const dev = localProcessSandbox() // runs on your host
const isolated = dockerSandbox({ image: 'node:22' }) // runs in a container
const daytona = daytonaSandbox({ apiKey: process.env.DAYTONA_API_KEY }) // managed cloud sandbox
const vercel = vercelSandbox({ runtime: 'node24' }) // managed Vercel microVM
```

> Cloud providers (Daytona, Vercel) run as remote VMs. When you drive them from
> your laptop, [tools](./tools) bridged from `chat()` can't dial your machine's
> `localhost` — you need the bridge tunnel. See the [tools guide](./tools) for the
> ngrok subpath, and the [Cloudflare guide](./cloudflare) for the edge-native
> co-located model.

## Local process

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const dev = localProcessSandbox()
```

- **Isolation:** none. The harness runs directly on your host, inheriting your
  host environment. Use it for trusted/dev work only — there is no boundary
  between the agent and your machine.
- **Auth / env:** inherits the host environment. No API key injection is required
  if your host CLI is already logged in.
- **Snapshot / resume:** no snapshots and no durable resume-by-id; each run
  re-creates and re-bootstraps under the same identity. The snapshot step is
  skipped silently (see [Capabilities](#capabilities)).

### Use a host CLI's own auth (`scrubEnv`)

Because `localProcessSandbox` runs the harness on your host, it inherits your host
environment — including any API keys exported there. Use `scrubEnv` to remove
variables before spawning, so the host CLI falls back to its own logged-in
session instead of billing the API. For example, drop `XAI_API_KEY` so Grok Build
uses your **grok.com login** (the same trick works for Claude Code with
`ANTHROPIC_API_KEY` → `claude login`):

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const hostLogin = localProcessSandbox({ scrubEnv: ['XAI_API_KEY'] })
```

> Only local-process can do this — it is the only provider that runs your host
> CLI. Isolated and cloud providers have no host login, so they always use an
> injected API key (supplied as a workspace secret).

## Docker

```ts
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const isolated = dockerSandbox({ image: 'node:22' })
```

- **Isolation:** a real container boundary between the agent and your host.
- **Auth / env:** no host login; provide credentials as workspace secrets, which
  are injected into the container env at create/resume. The agent reaches host
  tools over `host.docker.internal` (see [tools](./tools)).
- **Snapshot / resume:** full commit-based snapshots, `fork`, and resume-by-id.
  Bootstrap snapshots after `setup` completes, so subsequent runs resume from the
  snapshot instead of re-running setup.

## Daytona

```ts
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'

const daytona = daytonaSandbox({ apiKey: process.env.DAYTONA_API_KEY })
```

- **Isolation:** a managed cloud sandbox — a remote VM you don't run yourself.
- **Auth / env:** needs `DAYTONA_API_KEY`. Harness credentials are injected as
  workspace secrets; there is no host login to fall back on.
- **Snapshot / resume:** no snapshots; resume-by-id reconnects to a still-running
  sandbox (not a restored point-in-time snapshot), plus port preview links for
  live previews.
- **Bridge:** the sandbox is remote, so a [bridged tool](./tools) call can't reach
  your laptop's `localhost`. In local dev, tunnel the bridge (see [tools](./tools));
  a deployed orchestrator is reachable out of the box.

## Vercel

```ts
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'

const vercel = vercelSandbox({ runtime: 'node24' })
```

- **Isolation:** a managed microVM (Vercel Sandbox).
- **Auth / env:** needs `VERCEL_TOKEN` plus a team/project. Harness credentials
  are injected as workspace secrets.
- **Snapshot / resume:** persistent resume-by-id with a durable filesystem, plus
  exposed-port domains for previews.
- **Bridge:** like Daytona, a remote VM — bridged tools need the tunnel in local
  dev (see [tools](./tools)).

## Sprites

```ts
import { spritesSandbox } from '@tanstack/ai-sandbox-sprites'

const sprites = spritesSandbox({ apiKey: process.env.SPRITES_API_KEY })
```

- **Isolation:** a managed [Sprites](https://sprites.dev) cloud sandbox (Fly.io) —
  a remote, stateful VM you don't run yourself.
- **Auth / env:** needs `SPRITES_API_KEY` (token form
  `org/projectNumber/tokenId/secret`); override the control-plane URL with
  `apiUrl` / `SPRITES_API_URL`. Harness credentials are injected as workspace
  secrets.
- **Snapshot / resume:** no snapshots; resume-by-id reconnects to the named
  Sprite (its filesystem is durable across idle suspend/resume).
- **Ports:** a Sprite proxies a single internal HTTP port (default `8080`,
  configurable via `httpPort`) to its always-on public URL. `ports.connect(8080)`
  switches the URL to `public` auth and returns it; other ports are not exposed.
- **Bridge:** like Daytona/Vercel, a remote VM — bridged tools need the tunnel in
  local dev (see [tools](./tools)).

## Capabilities

Providers declare what they support via `capabilities()`. The flags are:

| Capability | Meaning |
| --- | --- |
| `fs` | Read/write the sandbox filesystem. |
| `exec` | Run commands. |
| `env` | Inject environment variables. |
| `ports` | Expose/forward ports (preview URLs). |
| `backgroundProcesses` | Keep long-running processes alive between calls. |
| `writableStdin` | A spawned process exposes a writable host→process stdin. `true` for local-process and Docker; `false` on remote/edge providers (Daytona, Vercel, Cloudflare), where stdin-fed harnesses deliver the prompt via a file + shell redirection instead. |
| `snapshots` | Capture and restore point-in-time snapshots. |
| `networkPolicy` | Enforce network allow/deny rules. |
| `durableFilesystem` | Disk that survives across resumes. |
| `fork` | Branch a sandbox from an existing one. |

Code that uses an **optional** capability checks the flag first and degrades
gracefully — for example, bootstrap only snapshots when `snapshots` is supported,
so `localProcessSandbox` simply skips the step. Calling an unsupported optional
method directly (instead of checking the flag) throws an
`UnsupportedCapabilityError`:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const provider = localProcessSandbox()
const caps = provider.capabilities()

if (caps.snapshots) {
  // safe to take a snapshot
} else {
  // degrade gracefully — local-process has no snapshots
}
```

Use the flags to write provider-agnostic code: branch on the capability rather
than the concrete provider, and your sandbox definition keeps working when you
swap one provider for another.
