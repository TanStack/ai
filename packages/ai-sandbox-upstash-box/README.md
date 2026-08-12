# @tanstack/ai-sandbox-upstash-box

Upstash Box sandbox provider for [TanStack AI](https://tanstack.com/ai). Runs
harness adapters inside isolated [Upstash Box](https://github.com/upstash/box)
cloud sandboxes through the uniform `SandboxHandle` — real filesystem, shell,
public preview URLs, and native snapshots.

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

| Capability            | Supported | Notes                                                                                                                    |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `fs`                  | ✅        | Native Box file API (read/write/list) + shell for mkdir/remove/rename.                                                   |
| `exec`                | ✅        | Combined stdout/stderr in `stdout`; `stderr` is always empty.                                                            |
| `env`                 | ✅        | Applied as shell `export` prefixes on subsequent `exec` calls.                                                           |
| `ports`               | ✅        | Public preview URLs via `getPublicURL`.                                                                                  |
| `snapshots`           | ✅        | Native `box.snapshot()` / `Box.fromSnapshot()`.                                                                          |
| `durableFilesystem`   | ✅        | Persists across pause/resume until deleted.                                                                              |
| `backgroundProcesses` | ✅        | `spawn()` streams stdout via `exec.stream`; no host-visible pid, `kill()` stops consuming the stream.                    |
| `writableStdin`       | ❌        | No host→process stdin; stdin-driven harnesses (Codex/Gemini ACP) must deliver the prompt via a file + shell redirection. |
| `networkPolicy`       | ❌        |                                                                                                                          |
| `fork`                | ❌        | `fork()` throws.                                                                                                         |
