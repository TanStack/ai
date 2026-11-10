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

# @tanstack/ai-sandbox-tangle

Tangle sandbox provider for [TanStack AI](https://tanstack.com/ai). Runs harness
adapters inside isolated [Tangle](https://tangle.tools) cloud sandboxes through
the uniform `SandboxHandle`: real filesystem, shell, background processes,
preview URLs, snapshots, and fork.

## Install

```bash
npm install @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-tangle
```

## Usage

```ts
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { tangleSandbox } from '@tanstack/ai-sandbox-tangle'

const sandbox = defineSandbox({
  id: 'agent',
  provider: tangleSandbox({
    apiKey: process.env.TANGLE_API_KEY, // or set the env var and omit
  }),
  workspace: defineWorkspace({ source: { type: 'none' } }),
})

// Then pass `withSandbox(sandbox)` as chat() middleware.
```

The API key falls back to the `TANGLE_API_KEY` environment variable when
`apiKey` is omitted.

### End-to-end example

Using the provider directly through the uniform `SandboxHandle` (no harness /
`chat()` involved):

```ts
import { tangleSandbox } from '@tanstack/ai-sandbox-tangle'

const provider = tangleSandbox()
const sbx = await provider.create({})
try {
  await sbx.fs.write('/workspace/hello.txt', 'hello from tangle')
  console.log(await sbx.fs.read('/workspace/hello.txt'))

  const run = await sbx.process.exec('node --version')
  console.log('node', run.stdout.trim(), '(exit', run.exitCode, ')')

  const server = await sbx.process.spawn('python3 -m http.server 3000')
  const channel = await sbx.ports.connect(3000)
  console.log('preview url:', channel.url)
  await server.kill()
} finally {
  await sbx.destroy()
}
```

## Configuration

| Option               | Default                        | Notes                                                                                                                    |
| -------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `apiKey`             | `TANGLE_API_KEY`               | Tangle API key.                                                                                                          |
| `baseUrl`            | `https://sandbox.tangle.tools` | Sandbox API URL. Must use HTTPS.                                                                                         |
| `environment`        | platform default               | A catalog environment or a container image, such as `node:22`. An image has a read-only root, and its `fork()` is slow.  |
| `resources`          | platform default               | `{ cpuCores, memoryMB, diskGB }`.                                                                                        |
| `maxLifetimeSeconds` | platform default               | Run time before the platform suspends the sandbox. The workspace is kept, and `resume` starts it again.                  |
| `idleTimeoutSeconds` | platform default               | Idle time before the platform suspends the sandbox.                                                                      |
| `egressPolicy`       | `{ mode: 'open' }`             | `open`, `strict` with `allowDomains`, or `blocked`. The platform default is `strict`. A `network: 'deny'` policy wins.   |
| `workdir`            | `/home/agent/workspace`        | Where the `/workspace` virtual root maps. Keep it under `/home/agent` or `/tmp`.                                         |
| `metadata`           | none                           | Extra metadata on every created sandbox. The deterministic sandbox id from `ensure()` is stored under `tanstack-ai-key`. |

## Capabilities

| Capability            | Supported | Notes                                                                                                      |
| --------------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `fs`                  | ✅        | Native file API for `read`, `readBytes`, and `write`; the rest runs as commands. `lstat` reports symlinks. |
| `exec`                | ✅        | Separate `stdout` and `stderr`, no run limit. Lost output is an error. An abort kills the process.         |
| `env`                 | ✅        | Env for each command, plus the `env.set` overlay. Nothing is sent at create.                               |
| `ports`               | ✅        | `ports.connect(port)` creates a preview link and returns its public HTTPS URL.                             |
| `snapshots`           | ✅        | `snapshot()` captures the workspace. `restoreSnapshot()` creates a new sandbox from it.                    |
| `durableFilesystem`   | ✅        | The workspace persists across stop and resume.                                                             |
| `backgroundProcesses` | ✅        | `spawn()` returns a real pid and separate streams. Past 8 MiB a stream is cut and the process killed.      |
| `writableStdin`       | ❌        | The process API takes no stdin stream; harnesses get their prompt from a file.                             |
| `killableProcesses`   | ✅        | `kill()` signals the process tree inside the sandbox, measured against a live sandbox.                     |
| `networkPolicy`       | ✅        | `policy.capabilities.network: 'deny'` maps to egress mode `blocked`.                                       |
| `fork`                | ✅        | `fork()` branches the running sandbox into a new one.                                                      |

The native file calls reach the sandbox user's home (`/home/agent`) and
`/tmp`. Read other paths with `process.exec`.

A new sandbox is created without the account's stored secrets. A restore from
a snapshot inherits them, because the API refuses an isolated restore.
