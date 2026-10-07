<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-sandbox-railway

Railway sandbox provider for [TanStack AI](https://tanstack.com/ai). Runs
harness adapters inside [Railway](https://railway.com) sandboxes through the
uniform `SandboxHandle`: real filesystem, shell, background processes, native
checkpoints, live disk fork, and optional preview domains.

What Railway adds over other providers:

- **Private networking.** With `networkIsolation: 'PRIVATE'` the sandbox joins
  your Railway environment's private network, so an agent can reach your other
  Railway services (databases, internal APIs) by their private hostnames.
- **Live disk fork.** `fork()` clones the running sandbox's disk into a new
  sandbox in one call. Processes are not copied.
- **Environment-scoped checkpoints.** A checkpoint belongs to the environment,
  not the sandbox, so `restoreSnapshot()` works after the source sandbox is
  destroyed.
- **Durable exec sessions.** Commands run in Railway exec sessions that survive
  a client disconnect on the Railway side.

## Install

```bash
npm install @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-railway
```

Requires Node 22 or newer (the `railway` SDK uses the global `WebSocket`; pass
`webSocketImpl` from the `ws` package where none exists).

## Usage

```ts
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { railwaySandbox } from '@tanstack/ai-sandbox-railway'

const sandbox = defineSandbox({
  id: 'agent',
  provider: railwaySandbox({
    environmentId: process.env.RAILWAY_ENVIRONMENT_ID,
    // The SDK resolves RAILWAY_TOKEN / RAILWAY_API_TOKEN.
    region: 'us-west2',
    idleTimeoutMinutes: 30,
  }),
  workspace: defineWorkspace({/* … */}),
})

// Then pass `withSandbox(sandbox)` as chat() middleware.
```

### End-to-end example

Using the provider directly through the uniform `SandboxHandle` (no harness /
`chat()` involved):

```ts
import { railwaySandbox } from '@tanstack/ai-sandbox-railway'

const provider = railwaySandbox({
  networkIsolation: 'PRIVATE', // required for ports; also joins the private network
  ports: [3000],
})
const sbx = await provider.create({})
try {
  await sbx.fs.write('/workspace/hello.txt', 'hello from railway')
  console.log(await sbx.fs.read('/workspace/hello.txt'))

  const run = await sbx.process.exec('node --version')
  console.log('node', run.stdout.trim(), '(exit', run.exitCode, ')')

  const channel = await sbx.ports.connect(3000)
  console.log('preview url:', channel.url)

  const ref = await sbx.snapshot!('after-setup') // ref.id = tsai-<sandbox-id>-<uuid>
  const copy = await provider.restoreSnapshot!({ snapshotId: ref.id })
  await copy.destroy()
} finally {
  await sbx.destroy()
}
```

To run a harness agent on Railway, pick **Railway** in the
[`ts-react-chat` sandbox triage example](../../examples/ts-react-chat/README.md#sandboxes--github-issue-triage-sandboxes).

## Configuration

| Option               | Default                                  | Notes                                                                                                                                         |
| -------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `token`              | `RAILWAY_TOKEN` / `RAILWAY_API_TOKEN`    | Explicit token. Defaults to bearer auth.                                                                                                      |
| `authType`           | `bearer` for an explicit token           | Set `'project-token'` when `token` is a project token. Ambient `RAILWAY_TOKEN` selects it automatically.                                      |
| `environmentId`      | `RAILWAY_ENVIRONMENT_ID`                 | Environment that owns sandboxes, checkpoints, and forks. Required with either kind of token.                                                                                      |
| `endpoint`           | Railway public API                       | GraphQL endpoint override. Must be `https` (plain `http` only for localhost).                                                                 |
| `region`             | platform default                         | Fresh sandboxes only. Checkpoint and template boots and forks run where their data lives, so it is not sent for them.                         |
| `idleTimeoutMinutes` | plan default                             | Railway destroys the sandbox after this much inactivity. `0` disables idle destruction where the plan allows it. Resume resets the countdown. |
| `resources`          | workspace default                        | `{ cpu, memoryGB }` per sandbox, applied to creates, restores, and forks. Values above the workspace maximum fail at create.                  |
| `networkIsolation`   | `ISOLATED`                               | `PRIVATE` joins the environment's private network. Both modes keep public internet egress.                                                    |
| `ports`              | none                                     | Ports published as Railway HTTP domains at create time (max 10). Requires `networkIsolation: 'PRIVATE'`.                                      |
| `checkpoint`         | none                                     | Boot every new sandbox from this named checkpoint.                                                                                            |
| `template`           | none                                     | Boot every new sandbox from a `Sandbox.template()` recipe from the `railway` SDK.                                                             |
| `workdir`            | `/workspace`                             | Where the `/workspace` virtual root maps. Created at boot.                                                                                    |
| `fetch`              | global `fetch`                           | Passed to the SDK.                                                                                                                            |
| `webSocketImpl`      | global `WebSocket`                       | Passed to the SDK for exec streaming.                                                                                                         |

Railway mints its own sandbox ids, so the deterministic id `ensure()` passes to
`create` is ignored (the contract allows this). Persist the returned id in your
instance store.

## Capabilities

| Capability            | Supported         | Why                                                                                                                                                                                                                                                        |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fs`                  | ✅                | Native SDK file sessions. `remove` is a recursive `rm -rf` (the SDK's own remove is not recursive); `lstat` is a GNU `stat` probe, because the SDK's `stat` follows symlinks and its mode bits are not POSIX.                                              |
| `exec`                | ✅                | Separate `stdout` and `stderr`; `cwd` and `env` travel in the exec init frame, never in the command string. Blocking `exec` runs without a durable session and is killed if the connection drops. An aborted `exec` resolves with the signalled exit code. |
| `env`                 | ✅                | Create-time runtime env plus a handle-local overlay merged into every command. Railway has no VM-wide mutable env.                                                                                                                                         |
| `backgroundProcesses` | ✅                | `spawn()` streams over a durable exec session, so a run keeps going if the host disconnects. `pid` is `-1`: the exec bridge exposes no remote pid.                                                                                                         |
| `snapshots`           | ✅                | Native checkpoints named `tsai-<sandbox-id>-<uuid>`. They are environment-scoped, so a restore works after the source is destroyed.                                                                                                                        |
| `fork`                | ✅                | Native live disk fork into a new sandbox in the same environment and region. Processes are not copied.                                                                                                                                                     |
| `ports`               | only with `ports` | Railway publishes domains at create time only and requires `PRIVATE` networking. Undeclared ports reject.                                                                                                                                                  |
| `writableStdin`       | ✅                | Spawned processes get a flow-controlled stdin writer, so stdio harness protocols (ACP) work.                                                                                                                                                               |
| `killableProcesses`   | ✅                | **Measured.** `kill()` and an aborted `signal` send `TERM` to the process group, escalate to `KILL` after 2 s, and settle only on the confirmed remote exit. The shared journal conformance kill case and the marker-file tests pass against production.   |
| `networkPolicy`       | ❌                | Both network modes keep public internet egress; `policy.capabilities.network: 'deny'` is rejected at create rather than ignored.                                                                                                                           |
| `durableFilesystem`   | ❌                | There is no stop/start that keeps the disk. An idle sandbox is destroyed; use checkpoints or portable snapshots to keep work.                                                                                                                              |

### Checkpoint retention

Checkpoints count against a per-plan quota, and the TanStack provider contract
has no delete hook. A checkpoint is not deleted when its source sandbox is
destroyed. Prune `tsai-*` checkpoints you no longer reference:

```ts
import { Sandbox } from 'railway'

for (const checkpoint of await Sandbox.checkpoints()) {
  if (checkpoint.key.startsWith('tsai-') && !stillReferenced(checkpoint.key)) {
    await Sandbox.deleteCheckpoint(checkpoint.id)
  }
}
```

## Known gaps

- **Preview domains are public** and create-time only. There is no per-port
  token and no dynamic port exposure.
- **No remote pid, no file watch.** `spawn()` reports `pid: -1`, and file
  watching falls back to polling.
- **No egress allowlist.** Both network modes keep public internet egress.
- **Live tests need credentials.** `tests/railway.test.ts` and the journal
  conformance suite run only with `RAILWAY_API_TOKEN` or `RAILWAY_TOKEN` plus
  `RAILWAY_ENVIRONMENT_ID`; without them they report a named skip.
