# @tanstack/ai-sandbox-upstash-box

Upstash Box sandbox provider for [TanStack AI](https://tanstack.com/ai). Runs
harness adapters inside isolated [Upstash Box](https://github.com/upstash/box)
cloud sandboxes through the uniform `SandboxHandle` — real filesystem, shell,
interactive processes, public preview URLs, and native snapshots.

## Install

```bash
npm install @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-upstash-box
```

## Usage

```ts
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { upstashBoxSandbox } from '@tanstack/ai-sandbox-upstash-box'

const sandbox = defineSandbox({
  id: 'agent',
  provider: upstashBoxSandbox({
    apiKey: process.env.UPSTASH_BOX_API_KEY, // or set the env var and omit
    runtime: 'node',
  }),
  workspace: defineWorkspace({
    /* … */
  }),
})

// Then pass `withSandbox(sandbox)` as chat() middleware.
```

The API key falls back to the `UPSTASH_BOX_API_KEY` environment variable when
`apiKey` is omitted.

### End-to-end example

Using the provider directly through the uniform `SandboxHandle` (no harness /
`chat()` involved):

```ts
import { upstashBoxSandbox } from '@tanstack/ai-sandbox-upstash-box'

const provider = upstashBoxSandbox({ runtime: 'node' })
const box = await provider.create({})
try {
  await box.fs.write('/workspace/hello.txt', 'hello from upstash box')
  console.log(await box.fs.read('/workspace/hello.txt'))

  const run = await box.process.exec('node --version')
  console.log('node', run.stdout.trim(), '(exit', run.exitCode, ')')

  const channel = await box.ports.connect(3000)
  console.log('preview url:', channel.url)
} finally {
  await box.destroy()
}
```

## Configuration

| Option          | Default               | Notes                                                                                                                                                           |
| --------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`        | `UPSTASH_BOX_API_KEY` | Upstash Box API key.                                                                                                                                            |
| `baseUrl`       | SDK default           | Overrides the Box API base URL.                                                                                                                                 |
| `runtime`       | `node`                | Box runtime image.                                                                                                                                              |
| `size`          | `small`               | Box resource size.                                                                                                                                              |
| `keepAlive`     | `false`               | `false` avoids billing a perpetually-running box and keeps `pause()` available. `true` prevents auto-pause mid-run but bills continuously and disables pausing. |
| `snapshot`      | —                     | Base snapshot id to create the box from (routed through `Box.fromSnapshot`).                                                                                    |
| `name`          | —                     | Human-readable box name. The caller's deterministic sandbox id (from `ensure()`) takes precedence when present.                                                 |
| `publicUrlAuth` | none                  | `{ bearerToken?, basicAuth? }` — auth to request when minting public URLs via `ports.connect`.                                                                  |

## Capabilities

| Capability            | Supported | Notes                                                                                       |
| --------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `fs`                  | ✅        | Native Box file API throughout; `exists` is a `stat` probe.                                 |
| `exec`                | ✅        | Separate `stdout` and `stderr`.                                                             |
| `env`                 | ✅        | Shell `export` prefixes for `exec`; passed natively to `spawn`.                             |
| `ports`               | ✅        | Public preview URLs via `getPublicURL`.                                                     |
| `snapshots`           | ✅        | Native `box.snapshot()` / `Box.fromSnapshot()`.                                             |
| `durableFilesystem`   | ✅        | Persists across pause/resume until deleted.                                                 |
| `backgroundProcesses` | ✅        | `spawn()` runs the command as a live `exec.session` with a real in-box pid.                 |
| `writableStdin`       | ✅        | `stdin.write()` / `stdin.end()` map to the session's `write` / `endStdin`.                  |
| `killableProcesses`   | ✅        | `kill()` signals the process tree server-side; `TERM`/`KILL`/`INT`/`HUP`, others send TERM. |
| `networkPolicy`       | ✅        | `policy.capabilities.network: 'deny'` maps to Box's `deny-all` egress mode.                 |
| `fork`                | ✅        | `snapshot()` + `Box.fromSnapshot()`. Costs a full snapshot round trip (~25s).               |

A spawned process is tied to its session: dropping the connection kills the
command, and sessions cannot be reattached. `spawn()` is therefore scoped to the
lifetime of the handle, not the box.

`network: 'deny'` is stricter here than under providers that model deny as an
allowlist. Box's `deny-all` blocks every outbound connection, so an agent that
runs fine under an allowlist-style deny will not reach package registries or
model provider hosts on this one. Leave the capability unset if the agent needs
either.
