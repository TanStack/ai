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

# @tanstack/ai-sandbox-e2b

E2B sandbox provider for [TanStack AI](https://tanstack.com/ai). Runs harness
adapters inside isolated [E2B](https://e2b.dev) cloud sandboxes (Firecracker
microVMs) through the uniform `SandboxHandle`: real filesystem, shell,
interactive processes, preview URLs, native snapshots, and fork.

## Install

```bash
npm install @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-e2b
```

## Usage

```ts
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'

const sandbox = defineSandbox({
  id: 'agent',
  provider: e2bSandbox({
    apiKey: process.env.E2B_API_KEY, // or set the env var and omit
  }),
  workspace: defineWorkspace({/* … */}),
})

// Then pass `withSandbox(sandbox)` as chat() middleware.
```

The API key falls back to the `E2B_API_KEY` environment variable when `apiKey`
is omitted.

### End-to-end example

Using the provider directly through the uniform `SandboxHandle` (no harness /
`chat()` involved):

```ts
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'

const provider = e2bSandbox()
const sbx = await provider.create({})
try {
  await sbx.fs.write('/workspace/hello.txt', 'hello from e2b')
  console.log(await sbx.fs.read('/workspace/hello.txt'))

  const run = await sbx.process.exec('node --version')
  console.log('node', run.stdout.trim(), '(exit', run.exitCode, ')')

  const channel = await sbx.ports.connect(3000)
  console.log('preview url:', channel.url)
} finally {
  await sbx.destroy()
}
```

## Configuration

| Option               | Default                | Notes                                                                                                                                       |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`             | `E2B_API_KEY`          | E2B API key.                                                                                                                                |
| `domain`             | `E2B_DOMAIN`           | E2B domain (`e2b.app`). Set it for a self-hosted or BYOC deployment.                                                                        |
| `apiUrl`             | `E2B_API_URL`          | Overrides the API base URL.                                                                                                                 |
| `template`           | SDK default (`base`)   | Sandbox template name or ID to create sandboxes from.                                                                                       |
| `timeoutMs`          | `1_800_000` (30 min)   | Sandbox lifetime. Resume extends it by the same amount. E2B caps it at 1 h (Hobby) or 24 h (Pro).                                           |
| `onTimeout`          | `'kill'`               | `'kill'` destroys the sandbox when the lifetime elapses. `'pause'` keeps it resumable instead.                                              |
| `workdir`            | `/home/user/workspace` | Where the `/workspace` virtual root maps. `/workspace` itself is not writable by the sandbox user.                                          |
| `metadata`           | none                   | Extra metadata on every created sandbox. The deterministic sandbox id from `ensure()` is always stored under `tanstack-ai-key`.             |
| `allowPublicTraffic` | E2B default (`true`)   | `false` gates every preview URL behind the `e2b-traffic-access-token` header; `ports.connect` then returns the token and a ready `headers`. |

## Capabilities

| Capability            | Supported | Notes                                                                                                  |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `fs`                  | ✅        | Native E2B filesystem API; `lstat` is a shell `stat` probe so symlinks are reported as symlinks.       |
| `exec`                | ✅        | Separate `stdout` and `stderr`; `cwd` and `env` are passed natively, never in the command string.      |
| `env`                 | ✅        | Create-time `envs` plus a per-command overlay.                                                         |
| `ports`               | ✅        | `https://<port>-<sandbox>.<domain>` preview URLs.                                                      |
| `snapshots`           | ✅        | Native `createSnapshot()`; the sandbox is paused briefly, then resumed. Restore creates a new sandbox. |
| `durableFilesystem`   | ✅        | Persists across commands and pause/resume until the sandbox is killed.                                 |
| `backgroundProcesses` | ✅        | `spawn()` runs as a background command with a real sandbox pid.                                        |
| `writableStdin`       | ✅        | `stdin.write()` / `stdin.end()` map to `sendStdin` / `closeStdin`.                                     |
| `killableProcesses`   | ✅        | `kill()` signals the whole process group (`setsid` leader), measured against a live sandbox.           |
| `networkPolicy`       | ✅        | `policy.capabilities.network: 'deny'` maps to `allowInternetAccess: false`.                            |
| `fork`                | ✅        | Native `fork()`: the parent is checkpointed in place (paused briefly) and the copy boots from that.    |

Every command runs as the leader of its own process group through `setsid`
(util-linux), so `kill()` reaches backgrounded children. The default E2B
template ships `setsid`; a custom image must include it or every command
fails with exit code 127.

`kill()` always sends `SIGKILL`; the requested signal is not honoured.
