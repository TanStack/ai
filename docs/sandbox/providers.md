---
title: Providers
id: providers
order: 3
description: "Pick and configure where a TanStack AI sandbox runs (local process, Docker container, Docker Sandboxes microVM, Daytona, or Vercel) and what each one can do."
---

A provider owns the isolation primitive: where the harness actually runs. Every
provider implements the same `SandboxProvider` / `SandboxHandle` contract, so the
[workspace](./workspace) you hand the agent and the [policy](./policy) that guards
it are provider-agnostic. Pick a provider for the isolation, auth, and
snapshot/resume behaviour you need; the rest of your sandbox definition stays the
same.

Provider-native snapshots and resume keep or recreate provider state. They can
reduce bootstrap time. [Portable Snapshots](./portable-snapshots) store
completed workspace data in your application persistence for reconstruction.

> The provider is _where_ the agent runs. For _which_ agent runs (Grok Build,
> Claude Code, Codex, OpenCode, or any ACP agent via `acpCompatible`) see
> [Harnesses](./harnesses).

## Choosing a provider

| Provider | Package | Isolation | Notes |
| --- | --- | --- | --- |
| Local process | `@tanstack/ai-sandbox-local-process` | none (host) | The fast, no-Docker dev loop. Trusted/dev use only. |
| Docker | `@tanstack/ai-sandbox-docker` | container | Real isolation; commit-based snapshots, fork, resume-by-id. |
| Docker Sandboxes (`sbx`) | `@tanstack/ai-sandbox-docker` | microVM | Native Docker Sandboxes. Same package as `dockerSandbox()`, different export: `sbxSandbox()`. Needs the `sbx` CLI, a login, and a hypervisor. |
| Daytona | `@tanstack/ai-sandbox-daytona` | cloud sandbox | Managed [Daytona](https://www.daytona.io/) sandboxes; snapshots after setup, port preview links, resume-by-id. Needs `DAYTONA_API_KEY`. |
| Vercel | `@tanstack/ai-sandbox-vercel` | microVM | Managed [Vercel Sandbox](https://vercel.com/docs/sandbox) microVMs; exposed-port domains, resume-by-id (persistent). Needs `VERCEL_TOKEN` + team/project. |
| Sprites | `@tanstack/ai-sandbox-sprites` | stateful sandbox | Managed [Sprites](https://sprites.dev) (Fly.io) sandboxes; durable filesystem, in-place checkpoints, single proxied public-URL port, resume-by-id. Needs `SPRITES_API_KEY`. |

Most providers are their own package. `dockerSandbox()` and `sbxSandbox()` both
come from `@tanstack/ai-sandbox-docker`. The constructor is the only thing that
differs between them:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { dockerSandbox, sbxSandbox } from '@tanstack/ai-sandbox-docker'
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'

const dev = localProcessSandbox() // runs on your host
const isolated = dockerSandbox({ image: 'node:22' }) // container
const microvm = sbxSandbox() // Docker Sandboxes microVM
const daytona = daytonaSandbox({ apiKey: process.env.DAYTONA_API_KEY }) // managed cloud sandbox
const vercel = vercelSandbox({ runtime: 'node24' }) // managed Vercel microVM
```

> Cloud providers (Daytona, Vercel) run as remote VMs. When you drive them from
> your laptop, [tools](./tools) bridged from `chat()` can't dial your machine's
> `localhost`, you need the bridge tunnel. See the [tools guide](./tools) for the
> ngrok subpath, and the [Cloudflare guide](./cloudflare) for the edge-native
> co-located model.

## Local process

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const dev = localProcessSandbox()
```

- **Isolation:** none. The harness runs directly on your host, inheriting your
  host environment. Use it for trusted or dev work only. There is no boundary
  between the agent and your machine.
- **Auth / env:** inherits the host environment. Set `authMode` on the harness
  (`'host'` or `'api-key'`). The provider does not pick this. See
  [Harness Auth](./auth).
- **Snapshot / resume:** no snapshots and no durable resume-by-id; each run
  re-creates and re-bootstraps under the same identity. The snapshot step is
  skipped silently (see [Capabilities](#capabilities)).

### Host login vs API key (`scrubEnv`)

The provider is where the agent runs, not how it signs in. The default
`authMode` is `'api-key'`. Set `'host'` when the machine already has a CLI
login. A local-process run can be your laptop or a GitHub runner. See
[Harness Auth](./auth).

`localProcessSandbox` inherits the host environment, including any API keys
exported there. If you set `authMode: 'host'`, pass `scrubEnv` so those keys
do not override the CLI login:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const hostLogin = localProcessSandbox({
  scrubEnv: ['XAI_API_KEY', 'GROK_API_KEY'],
})
```

If the same local-process sandbox runs on a CI machine, set
`authMode: 'api-key'`. Then inject the key as a workspace secret. Isolated and
cloud providers have no host CLI login. Use `authMode: 'api-key'` and
workspace secrets there.

### Windows process teardown (`logger`)

Killing a spawned process means killing the whole tree, and on Windows that takes
more than `taskkill /T`. Commands run through a git-bash `sh`, and MSYS's
fork emulation runs the final command of a statement list, such as the
`tail -f` behind a [journal](./journal) follow read, under an intermediate shell
that immediately exits. Windows never reparents, so the surviving process points
at a dead parent and `taskkill /T`, which walks only live parent links, cannot
reach it **while still exiting `0`**. Left alone, every follow read leaks a
process for the life of the machine.

`localProcessSandbox` therefore consults MSYS's own process table, which does
keep the logical parentage before killing, then kills any descendant `/T` missed.
Teardown is total by construction: it never throws, because a throwing kill would
strand a run mid-flight. That means a kill it genuinely cannot complete (a
protected process, access denied) is otherwise invisible, so pass a `logger` to
see it:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const dev = localProcessSandbox({
  logger: {
    warn: (message, meta) => console.warn(message, meta),
  },
})
```

Any object with a `warn(message, meta?)` method works, so the `InternalLogger`
your adapter already receives can be handed straight in. A process that had
already exited on its own is **not** a failure and is never reported.

Nothing here changes on POSIX, where `sh` really is the command's parent and
signalling the wrapper is enough.

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

## Docker Sandboxes (sbx)

```ts
import { sbxSandbox } from '@tanstack/ai-sandbox-docker'
import { defineSandbox, defineWorkspace, githubRepo } from '@tanstack/ai-sandbox'

const isolated = sbxSandbox({
  allowNetwork: ['*.npmjs.org', 'registry.npmjs.org'],
})

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: isolated,
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/repo' }),
    setup: ['pnpm install'],
  }),
})
```

- **Isolation:** a hypervisor microVM. The sandbox has its own kernel and its own Docker daemon. This is not `dockerSandbox()`, which starts a container.
- **Needs:** `sbx` on `PATH`, `sbx login` (or a PAT piped to `sbx login --password-stdin` in CI), and a hypervisor (Hyper-V, Virtualization.framework, or KVM). A Docker socket is not enough.
- **Workspace:** `sbx create --clone` copies a host Git repo into the VM. Pass `workspaceDir` that contains `.git`, or set `workspace.source` to a git URL. If there is no Git repo, create throws. There is no bind-mount fallback.
- **Auth / env:** inject API keys as workspace secrets. v1 does not call `sbx secret`.
- **Snapshot / resume:** no snapshots and no fork. Resume reconnects by name (`sbx ls`). A stopped sandbox starts again on the next `sbx exec`.
- **Network:** this is the first provider with `networkPolicy: true`. See [Policy](./policy).

## Daytona

```ts
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'

const daytona = daytonaSandbox({
  apiKey: process.env.DAYTONA_API_KEY,
  snapshot: 'daytona-medium',
  autoStopInterval: 0,
})
```

- **Isolation:** a managed cloud sandbox on a remote VM you do not run yourself.
- **Auth / env:** needs `DAYTONA_API_KEY`. Put harness credentials in
  [workspace secrets](./provisioning). They are applied to the live sandbox
  at create, resume, and restore. They are not stored on the Daytona create
  record, and they are not written into command history.
- **Snapshot / resume:** point-in-time snapshots after setup (default when
  `lifecycle.snapshot` is `'after-setup'`). Pass `snapshot` on
  `daytonaSandbox()` to pick the Daytona image (for example
  `'daytona-medium'`). Resume starts a `stopped` or `archived` sandbox, then
  returns the handle.
- **Idle stop:** Daytona stops an idle sandbox after 15 minutes by default.
  Set `autoStopInterval` in minutes to change that. Pass `0` to turn auto-stop
  off. Set `ephemeral: true` to delete the sandbox when it stops.
- **Network:** `policy.capabilities.network: 'deny'` blocks all outbound
  network on create.
- **Working directory:** the portable root `/workspace` maps to
  `/home/daytona/workspace` by default. Override with `workdir` on
  `daytonaSandbox()` if you need another path.
- **Stdin:** spawned processes accept host stdin (`writableStdin: true`).
- **Privileges:** the Daytona user is not root. Package installs in `setup`
  must use `sudo -n` (for example `sudo -n apt-get install …`). Do not put
  `sudo *` in a [policy](./policy) deny list for this provider.
- **Bridge:** the sandbox is remote, so a [bridged tool](./tools) call cannot
  reach your laptop's `localhost`. In local dev, tunnel the bridge (see
  [tools](./tools)). A deployed orchestrator is reachable without a tunnel.

Default headless path on Daytona:

```ts
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import {
  defineSandbox,
  defineSandboxPolicy,
  defineWorkspace,
  gitSkill,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'

const sandbox = defineSandbox({
  id: 'daytona-agent',
  provider: daytonaSandbox({
    apiKey: process.env.DAYTONA_API_KEY,
    snapshot: 'daytona-medium',
  }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    skills: [gitSkill({ repo: 'owner/skills-pack' })],
  }),
  policy: defineSandboxPolicy({
    default: 'allow',
  }),
})

const stream = chat({
  adapter: grokBuildText('grok-build'),
  messages: [{ role: 'user', content: 'List the project files.' }],
  middleware: [withSandbox(sandbox)],
})
```

Headless Grok Build and Codex stay on auto-approve with `default: 'allow'`.
Isolation is the Daytona VM. Use Claude Code when you need command-level deny.

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
- **Bridge:** like Daytona, it is a remote VM, so bridged tools need the tunnel in local
  dev (see [tools](./tools)).

## Sprites

```ts
import { spritesSandbox } from '@tanstack/ai-sandbox-sprites'

const sprites = spritesSandbox({ apiKey: process.env.SPRITES_API_KEY })
```

- **Isolation:** a managed [Sprites](https://sprites.dev) stateful sandbox
  (Fly.io), a remote VM you do not run yourself.
- **Auth / env:** needs `SPRITES_API_KEY` (token form
  `org/projectNumber/tokenId/secret`); override the control-plane URL with
  `apiUrl` / `SPRITES_API_URL`. Harness credentials are injected as workspace
  secrets.
- **Snapshot / resume:** resume-by-id reconnects to the named Sprite (its
  filesystem is durable across idle suspend/resume). `snapshot()` creates a
  Sprite **checkpoint** (a save point of the writable overlay); restore is
  **in-place** on the same Sprite via the handle's `restoreCheckpoint()` /
  `listCheckpoints()`. A checkpoint does not survive Sprite deletion, so the
  provider intentionally does **not** implement the reconstruct-after-gone
  `restoreSnapshot`, when a Sprite is gone the framework degrades to a fresh
  create instead. Restore restarts the environment and can take minutes;
  `restoreCheckpoint()` polls the workspace until it is listable again before
  resolving. Note that immediately after a restore the overlay can be listable
  while individual file reads briefly return an I/O error as it settles, so retry
  reads if you act on the filesystem the instant restore returns.
- **Ports:** a Sprite proxies a single internal HTTP port (default `8080`,
  configurable via `httpPort`) to its always-on public URL. `ports.connect(8080)`
  switches the URL to `public` auth and returns it; other ports are not exposed.
- **Bridge:** like Daytona and Vercel, it is a remote VM, so bridged tools need the tunnel in
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
| `writableStdin` | A spawned process exposes a writable host→process stdin. `true` for local-process, Docker container, and Daytona. `false` for Docker Sandboxes (`sbx`), Vercel, and Cloudflare. When `false`, stdin-fed harnesses write the prompt to a file and redirect it in the shell. |
| `killableProcesses` | A spawned process can be forcibly stopped via `SpawnHandle.kill()` **and** aborted mid-flight via the `signal` passed to `spawn`. |
| `snapshots` | Capture and restore point-in-time snapshots. |
| `networkPolicy` | Enforce network allow/deny rules. |
| `durableFilesystem` | Disk that survives across resumes. |
| `fork` | Branch a sandbox from an existing one. |

Code that uses an **optional** capability checks the flag first and degrades
gracefully. For example, bootstrap only snapshots when `snapshots` is supported,
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
  // degrade gracefully, local-process has no snapshots
}
```

Use the flags to write provider-agnostic code: branch on the capability rather
than the concrete provider, and your sandbox definition keeps working when you
swap one provider for another.

### `killableProcesses` across the bundled providers

This flag is **measured, not asserted**. A wrong `true` hands the journal reader
an unstoppable `tail -f` and leaks a process per run, so a provider only declares
it once killing has been observed to work against a real sandbox. Two of these
declarations were once `true` on reasoning alone and both turned out to be false
when probed (Docker's stream destroy left the container-side process in `ps`;
local-process's `sh -c` did not `exec`, so killing the shell left the command
alive). Anything that cannot be measured yet stays `false`, because `poll` is
merely slower while a wrong `follow` is a leak.

| Provider | `killableProcesses` | Why |
| --- | --- | --- |
| Local process | `true` | **Measured.** Kills the process GROUP, not the wrapper: `detached` spawn plus `process.kill(-pid, signal)` on POSIX (killing only the `sh` left the command running, dash does not reliably `exec`); on Windows `taskkill /T` plus a verified sweep, see [Windows teardown](#windows-process-teardown-logger). |
| Docker | `true` | **Measured.** Signals the process INSIDE the container by the pid the wrapper recorded for itself, process group first and escalating to `KILL`. Destroying the hijacked exec stream is *not* sufficient: it only detaches the client. |
| Docker Sandboxes (`sbx`) | `false` | Unmeasured. Live tests named-skip until `sbx login`. The handle records a pid in the VM, but `killableProcesses` stays `false` until that kill is observed. |
| Daytona | `false` | `kill()` only aborts the client-side poll loop and does not await any termination; the `deleteSession` that might terminate the command runs later from the pump's teardown, is failure-swallowed, and is documented as cleanup for a *completed* session. Unmeasured, needs `DAYTONA_API_KEY`. |
| Vercel | `false` | The abort signal reaches only the HTTP request that STARTS a detached command, so the old `kill()` was a no-op. It now issues the SDK's server-side `Command.kill`, but whether that reaches a forked child (the follow command is a multi-statement shell, so `tail -f` is always a child) is unmeasured, needs Vercel credentials. |
| Sprites | `true` (unverified) | Not a client-side detach: `kill()` issues a real server-side `POST /exec/<sessionId>/kill` before closing the socket. What that endpoint signals (process group or pid) is undocumented and unmeasured; needs `SPRITES_API_KEY`. |
| Cloudflare | `false` | `kill()` is a no-op, and the caller's `AbortSignal` reaches neither `exec` nor `spawn`, because Workers RPC cannot serialize one. |

Each of the remote providers registers the shared journal conformance suite, so
the claim is falsifiable rather than asserted: with credentials present the suite
runs against a real sandbox, and without them it reports a **named skip** carrying
the reason instead of a silent pass. Cloudflare's gate is the runtime rather than
credentials, its provider can only create a sandbox through a `Sandbox` Durable
Object binding, which no Node test process has, so its registration is a named
skip saying exactly that, until a Workers-runtime harness can measure it.

This flag is required on every provider, including a bring-your-own one. A
provider that omitted it would be treated as killable, which is the dangerous
default: a follower process started there could never be reclaimed, and it would
keep running inside the sandbox for as long as the sandbox lives.

It is the flag the [run journal](./journal) reads to decide how to tail a run's
output: a killable provider gets a streaming `tail -f`, and a provider like
Cloudflare gets a loop of bounded reads, each of which terminates on its own.

The flag also bounds what *cancel* can mean. On a `false` provider there is no
signal path to the agent process, so the only cancel that actually stops the
agent means destroying the sandbox, which is what the cancel path does. See
[what cancel means on a provider that cannot kill](./takeover#what-cancel-means-on-a-provider-that-cannot-kill).
