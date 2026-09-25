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

# @tanstack/ai-sandbox-boxd

boxd sandbox provider for [TanStack AI](https://tanstack.com/ai). Runs harness
adapters inside isolated [boxd](https://boxd.sh) KVM microVMs through the
uniform `SandboxHandle`: a real filesystem, a shell, background processes with
a writable stdin, one public HTTPS URL per machine, snapshots, and live forks.

## Install

```bash
npm install @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-boxd
```

## Usage

```ts
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { boxdSandbox } from '@tanstack/ai-sandbox-boxd'

const sandbox = defineSandbox({
  id: 'agent',
  provider: boxdSandbox({
    apiKey: process.env.BOXD_API_KEY, // or set the env var and omit
    org: 'acme', // or set BOXD_ORG
    vcpu: 2,
  }),
  workspace: defineWorkspace({/* … */}),
})

// Then pass `withSandbox(sandbox)` as chat() middleware.
```

The API key falls back to the `BOXD_API_KEY` environment variable when
`apiKey` is omitted, and the org to `BOXD_ORG`. A boxd API key is fenced to
one org, so pass the org the key was minted for.

### End-to-end example

Using the provider directly through the uniform `SandboxHandle` (no harness /
`chat()` involved):

```ts
import { boxdSandbox } from '@tanstack/ai-sandbox-boxd'

const provider = boxdSandbox({ org: 'acme' })
const machine = await provider.create({})
try {
  await machine.fs.write('/workspace/hello.txt', 'hello from boxd')
  console.log(await machine.fs.read('/workspace/hello.txt'))

  const run = await machine.process.exec('node --version')
  console.log('node', run.stdout.trim(), '(exit', run.exitCode, ')')

  const channel = await machine.ports.connect(3000)
  console.log('public url:', channel.url)
} finally {
  await machine.destroy()
}
```

## Configuration

| Option               | Default                | Notes                                                                                                   |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `apiKey`             | `BOXD_API_KEY`         | boxd API key (`bxd_…`). The SDK also accepts a session token in `BOXD_TOKEN`.                           |
| `org`                | `BOXD_ORG`             | Organization the machines are created in. Set it to the org the key belongs to.                         |
| `baseUrl`            | `BOXD_BASE_URL`        | Overrides the API endpoint. Defaults to production.                                                     |
| `vcpu`               | org default            | Machine size class: `1` (4 GiB), `2` (8 GiB), or `4` (16 GiB). boxd resolves memory from it.            |
| `fromSnapshot`       | default image          | boxd snapshot (name or id) to boot new machines from. The snapshot fixes the size.                      |
| `workdir`            | `/home/boxd/workspace` | Working directory inside the machine. The `/workspace` virtual root maps here.                          |
| `autoSuspendTimeout` | platform default       | Seconds of idleness before the machine suspends to RAM. `0` disables. Idle means no inbound connection. |
| `autoDestroyTimeout` | `0` (never)            | Seconds after start before the machine is destroyed. A safety net for abandoned sandboxes.              |
| `logger`             | none                   | `{ warn(message, meta?) }`. Receives a kill the machine refused, so an orphaned process is visible.     |

Every machine is created `isolated`. That strips the in-VM `boxd` CLI, the
metadata endpoint and org integrations, and keeps the machine off the org
network. It is not configurable.

## Capabilities

| Capability            | Supported | Notes                                                                                                    |
| --------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| `fs`                  | ✅        | Reads and writes through the machine file API. Everything else desugars to `exec`.                       |
| `exec`                | ✅        | Separate `stdout` and `stderr`, real exit codes. No client-side deadline.                                |
| `env`                 | ✅        | Per-command env, merged over `env.set()`. The API key never enters the machine.                          |
| `ports`               | ✅        | `ports.connect(port)` pins the machine's public `https://<name>.boxd.sh` route to the port.              |
| `snapshots`           | ✅        | boxd snapshots (memory + disk). `restoreSnapshot()` boots a new machine with captured processes running. |
| `durableFilesystem`   | ✅        | The 100 GB disk persists across stop, suspend and hibernate until `destroy()`.                           |
| `backgroundProcesses` | ✅        | `spawn()` runs the command over a streaming exec. It outlives a closed stream until killed.              |
| `writableStdin`       | ✅        | `stdin.write()` / `stdin.end()` map to the stream's `write` / `end`.                                     |
| `killableProcesses`   | ✅        | Measured. `kill()` signals the process group inside the machine, escalates to `KILL`, checks `kill -0`.  |
| `networkPolicy`       | ❌        | boxd has an egress allowlist per machine, but the contract's allow/deny gate has no surface for it yet.  |
| `fork`                | ✅        | Live boxd fork: disk, memory and running processes. Ready in under a second.                             |

`stop` is a power-off. A file written seconds before it can still sit in the
page cache and be lost, so run `sync` before you stop a machine yourself.
Suspend, hibernate, snapshot and fork keep memory and do not lose it.

A snapshot is an org-level artifact. The framework never deletes one, so
remove snapshots you no longer need with the boxd CLI or SDK, or set
`lifecycle.snapshot: 'none'` on the sandbox.
