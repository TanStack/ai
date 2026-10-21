---
title: Providers (Advanced)
id: providers-advanced
description: "Per-provider details for TanStack AI sandboxes: isolation, auth, snapshots, resume, ports, network, processes, and why each provider sets killableProcesses the way it does."
keywords:
  - sandbox providers
  - killableProcesses
  - writableStdin
  - scrubEnv
  - provider snapshots
---

Use this page when you have picked a provider on [Providers](./providers) and need its limits before production. Each section starts with the constructor, then lists what is different about that provider.

## Local process

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const dev = localProcessSandbox()
```

- **Isolation:** none. The harness runs directly on your host and inherits your host env. Use it for trusted or dev work only.
- **Auth and env:** the harness inherits the host env. Set `authMode` on the harness (`'host'` or `'api-key'`). The provider does not pick this. See [Harness Auth](./auth).
- **Snapshot and resume:** no snapshots and no resume by id. Each run creates and bootstraps again under the same identity. The snapshot step is skipped with no error.

### Host login vs API key (`scrubEnv`)

`localProcessSandbox` inherits the host env, with any API keys exported there. If you set `authMode: 'host'`, pass `scrubEnv`. Then those keys do not override the CLI login:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const hostLogin = localProcessSandbox({
  scrubEnv: ['XAI_API_KEY', 'GROK_API_KEY'],
})
```

A local-process run can be your laptop or a GitHub runner. If the same sandbox runs on a CI machine, set `authMode: 'api-key'` and inject the key as a workspace secret.

### Windows process teardown (`logger`)

To kill a spawned process, the provider kills the whole process tree. On Windows, `taskkill /T` is not enough:

- Commands run through a git-bash `sh`.
- MSYS fork emulation runs the last command of a statement list (for example the `tail -f` of a [journal](./journal) follow read) under a middle shell that exits at once.
- Windows does not reparent. The surviving process points at a dead parent, and `taskkill /T` follows only live parent links. It cannot reach that process, and it still exits `0`.

Without a fix, every follow read leaks a process for the life of the machine. So `localProcessSandbox` reads the MSYS process table, which keeps the logical parents. Then it kills any child that `/T` missed.

Teardown never throws, because a kill that throws can strand a run in the middle. As a result, a kill that cannot complete (a protected process, access denied) is silent. Pass a `logger` to see it:

```ts
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const dev = localProcessSandbox({
  logger: {
    warn: (message, meta) => console.warn(message, meta),
  },
})
```

Any object with a `warn(message, meta?)` method works. You can pass the `InternalLogger` that your adapter already receives. A process that already exited on its own is not a failure, and the provider does not report it.

On POSIX, nothing here changes. There, `sh` is the real parent of the command, and a signal to the wrapper is enough.

## Docker

```ts
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const isolated = dockerSandbox({ image: 'node:22' })
```

- **Isolation:** a real container boundary between the agent and your host.
- **Auth and env:** no host login. Pass credentials as workspace secrets. They go into the container env at create and resume.
- **Tools:** the agent reaches host tools at `host.docker.internal`. See [Tools](./tools).
- **Snapshot and resume:** full commit-based snapshots, `fork`, and resume by id. Bootstrap takes a snapshot after `setup`, so later runs resume from it and skip setup.

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

- **Isolation:** a hypervisor microVM with its own kernel and its own Docker daemon. `dockerSandbox()` starts a container. `sbxSandbox()` starts a VM.
- **Needs:** `sbx` on `PATH`, `sbx login`, and a hypervisor (Hyper-V, Virtualization.framework, or KVM). A Docker socket is not enough. In CI, pipe a PAT to `sbx login --password-stdin`.
- **Workspace:** `sbx create --clone` copies a host Git repo into the VM. Pass a `workspaceDir` that contains `.git`, or set `workspace.source` to a git URL. If there is no Git repo, create throws. There is no bind-mount fallback.
- **Auth and env:** inject API keys as workspace secrets. v1 does not call `sbx secret`.
- **Snapshot and resume:** no snapshots and no fork. Resume connects again by name (`sbx ls`). A stopped sandbox starts again on the next `sbx exec`.
- **Network:** this provider has `networkPolicy: true`. See [Policy](./policy#network-policy-on-docker-sandboxes).

## Daytona

```ts
import { daytonaSandbox } from '@tanstack/ai-sandbox-daytona'

const daytona = daytonaSandbox({
  apiKey: process.env.DAYTONA_API_KEY,
  snapshot: 'daytona-medium',
  autoStopInterval: 0,
})
```

- **Isolation:** a managed cloud sandbox on a remote VM that you do not run.
- **Auth and env:** needs `DAYTONA_API_KEY`. Put harness credentials in [workspace secrets](./provisioning).
- **How secrets stay hidden:** at create and snapshot restore, Daytona stores each secret value as an organization Secret. It mounts a placeholder in the sandbox env. The create record, the dashboard env view, and session command strings do not contain the real value. Daytona puts the real value into outbound HTTPS requests.
- **Per-command env:** `opts.env` uses the env argument of `executeCommand`, or a sourced env file. The provider never writes `export KEY=` prefixes into the command string.
- **Snapshot and resume:** point-in-time snapshots after setup (the default when `lifecycle.snapshot` is `'after-setup'`). Pass `snapshot` on `daytonaSandbox()` to pick the Daytona image (for example `'daytona-medium'`). Resume starts a `stopped` or `archived` sandbox, then returns the handle.
- **Idle stop:** Daytona stops an idle sandbox after 15 minutes by default. Set `autoStopInterval` in minutes to change that. Pass `0` to turn auto-stop off. Set `ephemeral: true` to delete the sandbox when it stops.
- **Network:** `policy.capabilities.network: 'deny'` blocks all outbound network at create.
- **Working directory:** the portable root `/workspace` maps to `/home/daytona/workspace` by default. Set `workdir` on `daytonaSandbox()` for another path.
- **Stdin:** spawned processes accept host stdin (`writableStdin: true`).
- **Privileges:** the Daytona user is not root. Package installs in `setup` must use `sudo -n` (for example `sudo -n apt-get install ...`). Do not put `sudo *` in a [policy](./policy) deny list for this provider.
- **Bridge:** the sandbox is remote, so a [bridged tool](./tools) call cannot reach your laptop's `localhost`. In local dev, tunnel the bridge. A deployed orchestrator needs no tunnel.

The default headless setup on Daytona:

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

Headless Grok Build and Codex stay on auto-approve with `default: 'allow'`. The Daytona VM is the isolation. If you need a deny rule for each command, use Claude Code.

## Vercel

```ts
import { vercelSandbox } from '@tanstack/ai-sandbox-vercel'

const vercel = vercelSandbox({ runtime: 'node24' })
```

- **Isolation:** a managed microVM (Vercel Sandbox).
- **Auth and env:** needs `VERCEL_TOKEN`, a team, and a project. Inject harness credentials as workspace secrets.
- **Snapshot and resume:** persistent resume by id with a durable filesystem.
- **Ports:** exposed-port domains for previews.
- **Bridge:** the sandbox is a remote VM, so bridged tools need the tunnel in local dev. See [Tools](./tools).

## Sprites

```ts
import { spritesSandbox } from '@tanstack/ai-sandbox-sprites'

const sprites = spritesSandbox({ apiKey: process.env.SPRITES_API_KEY })
```

- **Isolation:** a managed [Sprites](https://sprites.dev) stateful sandbox (Fly.io). It is a remote VM that you do not run.
- **Auth and env:** needs `SPRITES_API_KEY` in the form `org/projectNumber/tokenId/secret`. Set `apiUrl` or `SPRITES_API_URL` to use another control-plane URL. Inject harness credentials as workspace secrets.
- **Resume:** resume by id connects to the named Sprite. Its filesystem stays across idle suspend and resume.
- **Checkpoints:** `snapshot()` creates a Sprite checkpoint (a save point of the writable overlay). Restore runs in place on the same Sprite, with `restoreCheckpoint()` and `listCheckpoints()` on the handle.
- **No restore after deletion:** a checkpoint does not survive Sprite deletion. For this reason, the provider does not implement `restoreSnapshot`. When a Sprite is gone, the framework creates a fresh one.
- **Restore timing:** restore restarts the environment and can take minutes. `restoreCheckpoint()` polls the workspace until it can list it again. Right after a restore, single file reads can return an I/O error for a short time while the overlay settles. If you act on the filesystem at once, retry those reads.
- **Ports:** a Sprite proxies one internal HTTP port (default `8080`, set with `httpPort`) to its public URL. `ports.connect(8080)` switches the URL to `public` auth and returns it. Other ports are not exposed.
- **Bridge:** a remote VM, so bridged tools need the tunnel in local dev. See [Tools](./tools).

## Upstash Box

```ts
import { upstashBoxSandbox } from '@tanstack/ai-sandbox-upstash-box'

const box = upstashBoxSandbox({ apiKey: process.env.UPSTASH_BOX_API_KEY })
```

- **Isolation:** a managed [Upstash Box](https://github.com/upstash/box) cloud sandbox. It is a remote container that you do not run.
- **Auth and env:** needs `UPSTASH_BOX_API_KEY` (or `apiKey`). Set `baseUrl` or `UPSTASH_BOX_BASE_URL` for another API base. Pick the image with `runtime` (default `node`) and the size with `size`.
- **Paths:** the `/workspace` root maps to the box home, `/workspace/home`. That is the `workspaceRoot` of the handle.
- **Processes:** `spawn()` opens a live `exec.session` over a WebSocket. A background process gets a real pid in the box, a writable stdin, separate stdout and stderr, and server-side signals.
- **Session scope:** a session owns its process. If the connection drops, the command dies, and you cannot attach to the session again. So `spawn()` lives as long as the handle, not as long as the box. Blocking `exec()` uses HTTP and wraps the command in a shell for `cwd` and env.
- **Snapshot and resume:** `snapshot()` calls `box.snapshot()`. `restoreSnapshot()` builds a new box from it with `Box.fromSnapshot()`, so a snapshot survives deletion of the box that made it. Resume by id uses `Box.get` (id or name) and probes `getStatus`. A deleted record resumes as `null`.
- **Ports:** `ports.connect(port)` creates a preview URL with `getPublicURL`. Without `publicUrlAuth` the URL has no auth. Pass `publicUrlAuth` to protect it:
  - `{ bearerToken: true }` returns a token and an `Authorization: Bearer` header.
  - `{ basicAuth: true }` returns Basic credentials.
- **Network:** `policy.capabilities.network: 'deny'` maps to the Box `deny-all` egress mode. The contract has only this one coarse gate, so you cannot use the Box domain and CIDR allowlists through it. `deny-all` blocks every outbound connection, so the agent cannot reach package registries or model hosts. If the agent needs either, leave the capability unset.
- **Fork:** `fork()` takes a snapshot of the box and creates a new box from it. It costs a full snapshot round trip (about 25 seconds). A Docker fork is a local commit and is faster.
- **Bridge:** a remote sandbox, so bridged tools need the tunnel in local dev. See [Tools](./tools).

## Blaxel

```ts
import { blaxelSandbox } from '@tanstack/ai-sandbox-blaxel'

const blaxel = blaxelSandbox({
  apiKey: process.env.BL_API_KEY,
  workspace: process.env.BL_WORKSPACE,
})
```

- **Isolation:** a managed [Blaxel](https://blaxel.ai) cloud sandbox on a remote VM that you do not run.
- **Image and size:** pick the image with `image` (default `blaxel/base-image:latest`) and the memory with `memory` (default 2048 MB). Set `region` (or `BL_REGION`) to pick a region. This also stops the SDK warning that `region` will become required.
- **Auth and env:** pass `apiKey` and `workspace`, or set `BL_API_KEY` and `BL_WORKSPACE`. If you omit the API key, the provider uses the SDK CLI login or client credentials. A requested workspace must match those credentials.
- **One workspace per process:** `@blaxel/core` auth is global to the process. The provider records the resolved workspace when you construct it. It rejects a later provider that asks for a different workspace.
- **Lifetime:** new sandboxes get a `1h` TTL by default, so an abandoned run cannot leave a paid sandbox running. Set `ttl` to change it, or `ttl: null` to manage the lifetime yourself.
- **Resume:** resume by id connects to the named sandbox. Its filesystem stays across idle suspend and resume for the life of the sandbox.
- **No snapshots or fork:** the Blaxel snapshot and fork API is a source-scoped private preview. It has no entitlement probe, and the docs do not say that snapshots survive source deletion. The framework needs `snapshots` to rebuild after the source is gone. So this provider sets `snapshots` and `fork` to `false` and does not expose `restoreSnapshot`.
- **Ports:** `ports.connect(port)` creates a preview URL for each port. Previews need a token by default. The returned channel carries the token and the `X-Blaxel-Preview-Token` header. Set `publicPreviews: true` for URLs with no auth.
- **Files:** `fs.watch()` is native, so file-event and diff hooks work without polling. `fs.lstat()` reports file, directory, and symlink metadata without following links. A missing path returns `undefined`. Other errors propagate. Custom images must have GNU `stat`.
- **Bridge:** a remote VM, so bridged tools need the tunnel in local dev. See [Tools](./tools).

Process output on Blaxel:

- stdout and stderr stream live through bounded remote capture pipelines.
- When stdout and stderr arrive at the same time, they travel as labeled records on one stream, also across keepalive boundaries.
- Each stream has an 8 MiB total limit. Past that limit, the process fails and is reaped remotely. Logs do not grow without limit on the provider host.
- Cancel uses the same process-group supervisor, because the pinned SDK does not prove that a named-process kill reaches child processes.
- Custom images must have Bash, `cat`, `mkfifo`, `dd`, `base64`, `tr`, and `wc`. The default Blaxel base image has them. The supervisor calls Bash directly, so process groups do not depend on the `/bin/sh` of the image.

Resume rules on Blaxel: a destroyed sandbox does not disappear at once. Blaxel keeps the record in a teardown state before it purges it. `resume()` treats deleting, deactivating, failed, and terminated records as gone. A `DEACTIVATED` sandbox stays resumable, the same as in the pinned SDK.

## boxd

```ts
import { boxdSandbox } from '@tanstack/ai-sandbox-boxd'

const boxd = boxdSandbox({
  apiKey: process.env.BOXD_API_KEY,
  org: 'acme',
  vcpu: 2,
})
```

- **Isolation:** a managed [boxd](https://boxd.sh) KVM microVM that you do not run. Every machine is created `isolated`: no `boxd` CLI in the VM, no metadata endpoint, no org integrations, and no peers on the org network.
- **Image:** Ubuntu 24.04 with Node 24, Python 3, git, Docker, and the Claude Code and Codex CLIs.
- **Auth and env:** needs `BOXD_API_KEY` (or `apiKey`) and the org of that key (`org` or `BOXD_ORG`). Set `baseUrl` or `BOXD_BASE_URL` for another endpoint. Harness credentials are workspace secrets and travel as env for each command. The API key never goes into the machine.
- **Size:** set `vcpu` to `1`, `2`, or `4`. boxd sets memory from it: 4, 8, or 16 GiB. The default is the default size of the org. Every machine has a 100 GB disk.
- **Working directory:** `/workspace` maps to `/home/boxd/workspace`. Set `workdir` to change it.
- **Cancel:** if you abort create or snapshot restore during startup, the provider tries to delete the new machine after the current SDK call ends.
- **Processes:** `spawn()` opens a streaming exec with separate stdout and stderr and a writable stdin. `kill()` signals the process group inside the machine and makes sure that it is gone. So `killableProcesses` is measured.
- **Snapshot and resume:** `snapshot()` saves memory and disk into a boxd snapshot named `<machine>-<label>`. It waits until the snapshot can be restored (about 25 s for an 8 GiB machine). `restoreSnapshot()` boots a new machine from it in about 1 s, and the saved processes are still running. Resume by id connects to the same machine across stop (2 to 3 s to start), suspend (about 140 ms), and hibernate.
- **Fork:** `fork()` is a live boxd fork of disk, memory, and running processes. It is ready in less than a second.
- **Ports:** every machine has one public HTTPS URL, `https://<name>.boxd.sh`. `ports.connect(port)` points that URL at `port` and returns it. The URL is public: anyone who has it can reach the port.
- **Golden image:** pass `fromSnapshot` to boot every new sandbox from a snapshot that you made after `setup`. The snapshot then sets the size.
- **Bridge:** a remote VM, so bridged tools need the tunnel in local dev. See [Tools](./tools).

Lifetime on boxd:

- A machine stays until `destroy()`.
- It suspends after `autoSuspendTimeout` idle seconds. It hibernates after 4 hours idle by default, with no compute cost. It wakes on the next command. Idle means no inbound connection.
- Set `autoDestroyTimeout` as a safety net for abandoned sandboxes.
- `stop` is a power-off. A file written seconds before can still be in the page cache and get lost. Run `sync` before you stop a machine yourself. Suspend, hibernate, snapshot, and fork keep memory, so they do not lose it.

## E2B

```ts
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'

const e2b = e2bSandbox({ apiKey: process.env.E2B_API_KEY })
```

- **Isolation:** a managed [E2B](https://e2b.dev) sandbox, a Firecracker microVM that you do not run. Pick the image with `template` (default: the E2B `base` template).
- **Auth and env:** needs `E2B_API_KEY` (or `apiKey`). Set `domain` (or `E2B_DOMAIN`) for a self-hosted or BYOC deployment. Harness credentials are [workspace secrets](./provisioning). At create and snapshot restore they go in as sandbox `envs`. Env for each command uses the native `envs` argument of the SDK. No value goes into a command string.
- **Lifetime:** a sandbox lives for `timeoutMs` (default 30 minutes), then E2B kills it, so an abandoned run cannot keep billing. Resume extends the lifetime by the same amount. Set `onTimeout: 'pause'` to keep a timed-out sandbox resumable. E2B caps the lifetime at 1 hour on the Hobby plan and 24 hours on Pro.
- **Snapshot and resume:** `snapshot()` calls `createSnapshot()`. The sandbox pauses for a short time, then resumes. `restoreSnapshot()` creates a new sandbox from that snapshot, so a snapshot survives deletion of its source. Resume by id uses `Sandbox.connect`, which also wakes a paused sandbox. A killed or expired sandbox resumes as `null`.
- **Fork:** `fork()` is native. E2B checkpoints the parent in place, and the copy boots from that checkpoint.
- **Processes:** every command runs as the leader of its own process group (`setsid`), so `kill()` reaches background children. `kill()` always sends `SIGKILL`. `spawn()` has a real sandbox pid, a writable stdin, and separate stdout and stderr. A custom template must include `setsid` (util-linux). The default template has it.
- **Ports:** `ports.connect(port)` returns `https://<port>-<sandbox-id>.<domain>`. With `allowPublicTraffic: false`, the URL needs the `e2b-traffic-access-token` header, and the channel carries it in `headers`. Browsers cannot send that header, so keep public traffic on for preview links that a person clicks.
- **Network:** `policy.capabilities.network: 'deny'` maps to `allowInternetAccess: false`, which blocks all outbound traffic. You cannot use the E2B per-host allow and deny lists through the coarse gate of the contract.
- **Paths:** `/workspace` maps to `/home/user/workspace` by default. Set `workdir` to change it. The sandbox user is `user` (not root) with passwordless `sudo`. `/workspace` itself is not writable.
- **Bridge:** a remote VM, so bridged tools need the tunnel in local dev. See [Tools](./tools).

## Railway

```ts
import { railwaySandbox } from '@tanstack/ai-sandbox-railway'

const railway = railwaySandbox({
  environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
  region: 'us-west2',
  idleTimeoutMinutes: 30,
  resources: { cpu: 2, memoryGB: 4 },
  // Optional: publish preview domains. Needs PRIVATE networking.
  networkIsolation: 'PRIVATE',
  ports: [3000],
})
```

- **Isolation:** a managed [Railway](https://railway.com) sandbox in a Railway environment, on a VM that you do not run. Boot from the base image, a named `checkpoint`, or a `Sandbox.template()` recipe (`template`).
- **Auth:** the SDK reads `RAILWAY_TOKEN` (a project token) or `RAILWAY_API_TOKEN` (an account or workspace token). An explicit `token` uses bearer auth by default. Pass `authType: 'project-token'` for a project token. The scope is the environment (`environmentId` or `RAILWAY_ENVIRONMENT_ID`), fixed for each provider.
- **Secrets:** harness credentials are [workspace secrets](./provisioning). At create and restore they go in as the runtime `env` of the sandbox. Env for each command travels in the exec init frame. No value goes into a command string.
- **Private networking:** with `networkIsolation: 'PRIVATE'`, the sandbox joins the private network of the environment. The agent can then reach your other Railway services (databases, internal APIs) by their private hostnames. The default, `ISOLATED`, has no private network access.
- **Lifetime:** Railway destroys a sandbox after `idleTimeoutMinutes` with no activity. If you omit it, the plan default applies. `0` turns off idle destruction where the plan allows it. Resume resets the idle countdown. `SandboxCreateInput` has no lifecycle hint, so set the timeout here.
- **No durable disk:** there is no stop and start that keeps the disk, so `durableFilesystem` is `false`. To keep work across idle expiry, use a checkpoint or [Portable Snapshots](./portable-snapshots).
- **Size:** `resources: { cpu, memoryGB }` sets vCPU (fractions are allowed) and memory in decimal GB for every create, restore, and fork. Omitted fields use the workspace default. Values above its maximum fail at create.
- **Fork:** `fork()` is a native live disk fork of the running sandbox into a new one, in the same environment and region. Processes are not copied. The fork gets the network mode, domains, and idle timeout of the parent, and a copy of its env overlay.
- **Cancel:** if create fails or times out after Railway made the sandbox, or the caller aborts during boot, the provider tries to destroy it. Both are best effort.
- **Ports:** Railway publishes HTTP domains at create time only. Declare them with `ports` (10 at most), which needs `networkIsolation: 'PRIVATE'`. `ports.connect(port)` returns `https://<domain>` for a declared port and rejects other ports. Without `ports`, the `ports` capability is `false`. The domain is public and has no preview token.
- **Network:** `networkPolicy` is `false`. Both modes keep public internet egress, so create rejects `policy.capabilities.network: 'deny'`. It does not drop it with no error.
- **Paths:** `/workspace` is a real directory that the provider creates at boot. Set `workdir` to change it. `fs.remove` is recursive (`rm -rf`). `fs.lstat` is a GNU `stat` probe that does not follow symlinks.
- **Bridge:** a remote VM, so bridged tools need the tunnel in local dev. See [Tools](./tools).

Snapshots and resume on Railway:

- `snapshot(label)` saves a native Railway checkpoint named `tsai-<sandbox-id>-<uuid>`. The label stays only on the returned ref, because checkpoint names belong to the environment and a capture replaces an existing name.
- Checkpoints belong to the environment, not the sandbox. So `restoreSnapshot()` boots a new sandbox from one after its source is destroyed. It applies env, network mode, domains, and idle timeout again from the provider config.
- Restores and forks run in the region of the source, so `region` applies to fresh sandboxes only.
- Checkpoints count against a quota for each plan, and the contract has no delete hook. Delete `tsai-*` checkpoints that you do not use with `Sandbox.checkpoints()` and `Sandbox.deleteCheckpoint()` from the `railway` SDK.
- Resume by id uses `Sandbox.connect`. A missing, `DESTROYED`, `DESTROYING`, or `FAILED` sandbox resumes as `null`. The provider waits for a `CREATING` one. Auth and transport errors are thrown again.

Processes on Railway:

- stdout and stderr stay separate.
- `spawn()` runs in a durable exec session with a flow-controlled stdin writer, so it keeps running if the host disconnects. The provider does not expose reattach, because the [run journal](./journal) owns run identity.
- `spawn()` reports `pid: -1`, because the exec bridge has no remote pid.
- Blocking `exec` runs without a durable session. If the connection drops, the command dies.
- `kill()` and an aborted `exec` send `TERM` to the process group, then `KILL` after 2 s. An aborted `spawn` sends `KILL` at once. All of them finish only on the confirmed remote exit. An aborted `exec` resolves with the exit code of the signal.

## `writableStdin` per provider

- `true`: local process, Docker container, Daytona, Upstash Box, E2B, boxd, and Railway.
- `false`: Docker Sandboxes (`sbx`), Vercel, Sprites, Blaxel, and Cloudflare.

When the value is `false`, a harness that reads its prompt from stdin gets the prompt from a file. The shell redirects that file into the process.

## `killableProcesses` per provider

This flag is measured, not assumed. A wrong `true` gives the journal reader a `tail -f` that it cannot stop, and that leaks a process for each run. So a provider sets `true` only after a kill worked against a real sandbox.

Reasoning alone is not enough. Two examples:

- On Docker, destroying the exec stream left the container-side process in `ps`.
- On local process, `sh -c` did not `exec`, so a kill of the shell left the command alive.

If a provider cannot be measured yet, it stays `false`. A `false` value only makes reads slower (`poll`). A wrong `true` value leaks a process (`follow`).

| Provider | `killableProcesses` | Why |
| --- | --- | --- |
| Local process | `true` | **Measured.** Kills the process group, not the wrapper. On POSIX: a `detached` spawn plus `process.kill(-pid, signal)`. A kill of only the `sh` left the command running, because dash does not always `exec`. On Windows: `taskkill /T` plus a sweep that makes sure, see [Windows process teardown](#windows-process-teardown-logger). |
| Docker | `true` | **Measured.** Signals the process inside the container by the pid that the wrapper recorded, process group first, then `KILL`. Destroying the hijacked exec stream is not enough: it only detaches the client. |
| Docker Sandboxes (`sbx`) | `false` | Not measured. Live tests skip by name until `sbx login`. The handle records a pid in the VM, but the flag stays `false` until a kill is observed. |
| Daytona | `false` | `kill()` only aborts the client-side poll loop and does not wait for termination. The `deleteSession` that can end the command runs later, from the pump teardown. It swallows failures, and its docs call it cleanup for a completed session. Not measured. Needs `DAYTONA_API_KEY`. |
| Vercel | `false` | The abort signal reaches only the HTTP request that starts a detached command. `kill()` sends the server-side `Command.kill` of the SDK. It is not measured whether that reaches a forked child. The follow command is a multi-statement shell, so `tail -f` is always a child. Needs Vercel credentials. |
| Sprites | `true` (not verified) | `kill()` sends a real server-side `POST /exec/<sessionId>/kill` before it closes the socket. It is not a client-side detach. It is not documented or measured what that endpoint signals (process group or pid). Needs `SPRITES_API_KEY`. |
| Upstash Box | `true` | **Measured.** `kill()` sends an allowed signal (`TERM`, `KILL`, `INT`, or `HUP`). The box agent sends it to the process tree on the server, so a forked child gets it too. Verified against production: a spawned `sleep 5 && touch <marker>` was killed, and the marker never appeared. Needs `UPSTASH_BOX_API_KEY`. |
| Blaxel | `true` | The provider reaps the supervisor and child process groups, then waits for the remote reaper to finish. Credential-gated journal conformance makes sure that cancel leaves no active follower process. |
| E2B | `true` | **Measured.** The SDK kill is a SIGKILL to the shell pid, and a background `( ... ) & wait` child survived it. So every command runs as a `setsid` group leader, and `kill()` runs `kill -KILL -- -<pid>` inside the sandbox. The shared journal conformance kill case passes against a real sandbox. Needs `E2B_API_KEY`. |
| Cloudflare | `false` | `kill()` does nothing. The `AbortSignal` of the caller reaches neither `exec` nor `spawn`, because Workers RPC cannot serialize one. |
| boxd | `true` | **Measured.** The spawn wrapper runs under `setsid`, so the recorded pid leads its own process group. `kill()` runs a shell inside the machine that signals that group, then sends `KILL`, then checks with `kill -0`. Closing the stream alone is not a kill: the process survived it. Verified against production: a spawned `sleep 5 && touch <marker>` was killed, and the marker never appeared. Needs `BOXD_API_KEY`. |
| Railway | `true` | **Measured.** `kill()` and an aborted `exec` send `TERM` to the process group, then `KILL` after 2 s. An aborted `spawn` sends `KILL` at once. Each one finishes only when the remote exit is confirmed. Verified against production: the shared journal conformance kill case passes. Spawned `sleep 5 && touch <marker>` commands (one with a background child) were killed before the marker appeared, for `kill()`, an aborted `exec`, and an aborted `spawn`. Needs `RAILWAY_API_TOKEN` or `RAILWAY_TOKEN` and `RAILWAY_ENVIRONMENT_ID`. |

Each remote provider registers the shared journal conformance suite, so you can test each claim:

- With credentials, the suite runs against a real sandbox.
- Without credentials, it reports a **named skip** with the reason. It never passes silently.
- Cloudflare is gated by the runtime, not by credentials. Its provider can create a sandbox only through a `Sandbox` Durable Object binding, and a Node test process has none. So its registration is a named skip that says this, until a Workers-runtime harness can measure it.

Every provider must set this flag, also a provider that you write yourself. If a provider omits it, the framework treats it as killable. That is the dangerous default: a follower process started there can never be reclaimed, and it runs inside the sandbox for the life of the sandbox.

The [run journal](./journal) reads the flag to decide how to read a run's output:

- A killable provider gets a streaming `tail -f`.
- A provider such as Cloudflare gets a loop of bounded reads. Each read ends on its own.

The flag also limits what cancel can do. On a `false` provider there is no signal path to the agent process. The only cancel that stops the agent is to destroy the sandbox, and the cancel path does that. See [what cancel means on a provider that cannot kill](./takeover#what-cancel-means-on-a-provider-that-cannot-kill).
