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

# @tanstack/ai-sandbox-render

Render sandbox provider for [TanStack AI](https://tanstack.com/ai). Runs
harness adapters inside [Render](https://render.com/docs/sandboxes) sandboxes
through the uniform `SandboxHandle`: real filesystem, shell, background
processes, snapshots, and an enforced egress policy.

## Install

```bash
npm install @tanstack/ai @tanstack/ai-sandbox @tanstack/ai-sandbox-render
```

Set `RENDER_API_KEY` and `RENDER_WORKSPACE_ID` (your `tea-` workspace id).

## Usage

```ts
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { renderSandbox } from '@tanstack/ai-sandbox-render'

const sandbox = defineSandbox({
  id: 'agent',
  provider: renderSandbox({ plan: '2c-4g', idleTimeoutSeconds: 900 }),
  workspace: defineWorkspace({/* source, setup, secrets */}),
})

// Then pass `withSandbox(sandbox)` as chat() middleware.
```

Use the provider directly through the `SandboxHandle`:

```ts
import { renderSandbox } from '@tanstack/ai-sandbox-render'

const provider = renderSandbox()
const sbx = await provider.create({})
try {
  await sbx.fs.write('/workspace/hello.txt', 'hello from render')
  console.log(await sbx.fs.read('/workspace/hello.txt'))

  const run = await sbx.process.exec('node --version')
  console.log('node', run.stdout.trim(), 'exit', run.exitCode)

  const ref = await sbx.snapshot!('after-setup')
  const copy = await provider.restoreSnapshot!({ snapshotId: ref.id })
  await copy.destroy()
} finally {
  await sbx.destroy()
}
```

## Configuration

| Option               | Default               | Notes                                                                                                          |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `token`              | `RENDER_API_KEY`      | Render API key.                                                                                                |
| `ownerId`            | `RENDER_WORKSPACE_ID` | Workspace id (`tea-...`).                                                                                      |
| `client`             | none                  | A pre-built `SandboxesClient` from `@renderinc/sdk`. Set `token` and `ownerId` on it; passing them too throws. |
| `sandboxGroupId`     | workspace default     | Snapshots restore only inside the group they were captured in.                                                 |
| `plan`               | `1c-2g`               | `1c-2g`, `2c-4g`, `4c-8g`, `8c-16g`, or a newer plan.                                                          |
| `timeoutSeconds`     | `86400`               | Maximum continuous runtime. Render terminates the sandbox after it.                                            |
| `idleTimeoutSeconds` | `900`                 | Render suspends an idle sandbox and keeps its disk. `0` turns off idle suspension.                             |
| `networkPolicy`      | `allow-all`           | Egress when the policy allows network, for example an `allow-list`. A `deny` policy sends `deny-all`.          |
| `buildName`          | none                  | Boot every new sandbox from this Render sandbox build (a custom image).                                        |
| `snapshotName`       | none                  | Boot every new sandbox from this named snapshot.                                                               |
| `snapshotKind`       | `filesystem`          | What `snapshot()` captures. `runtime` also keeps memory and processes, and needs the same `plan`.              |
| `workdir`            | `/workspace`          | Where the `/workspace` virtual root maps. Created at boot.                                                     |

Render makes its own `sbx-` ids, so `create` ignores the id that `ensure()`
passes. Keep the returned id in your instance store.

## Capabilities

| Capability            | Supported | Why                                                                                                                                                                                                   |
| --------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fs`                  | yes       | `read`, `readBytes`, and `write` use native file transfer. Other calls run one shell command each. `lstat` is a GNU `stat` probe that does not follow symlinks.                                       |
| `exec`                | yes       | Separate `stdout` and `stderr`. An aborted `exec` resolves with the exit code of the signal.                                                                                                          |
| `env`                 | yes       | Create-time env plus a shared root-only overlay in memory-backed `/dev`, replaced when secrets are reapplied. No value goes into a command string.                                                    |
| `backgroundProcesses` | yes       | `spawn()` streams output. `pid` is `-1`. A command keeps running if the host disconnects.                                                                                                             |
| `killableProcesses`   | yes       | A supervisor owns each command group and stops remaining children. `kill(signal)` sends the requested signal (`TERM` by default), then `KILL` after 2 s, and prevents delayed commands from starting. |
| `snapshots`           | yes       | `filesystem` by default, `runtime` with `snapshotKind`. Named `tsai-<label>`.                                                                                                                         |
| `networkPolicy`       | yes       | `deny-all`, `allow-all`, and `allow-list` are enforced by Render.                                                                                                                                     |
| `durableFilesystem`   | yes       | An idle sandbox suspends with its disk and resumes on the next command or file call.                                                                                                                  |
| `ports`               | no        | Render sandboxes have no inbound ports.                                                                                                                                                               |
| `writableStdin`       | no        | Render exec has no stdin. Harnesses get their prompt from a file.                                                                                                                                     |
| `fork`                | no        | Render has no native fork.                                                                                                                                                                            |

## Known limits

- **No ports and no stdin.** Harnesses that need either one, such as OpenCode
  and ACP harnesses, do not run on Render. Claude Code and Codex run.
- **Snapshots are not deleted for you.** Delete `tsai-*` snapshots that you do
  not use with `sandboxes.snapshots.delete()` from `@renderinc/sdk`.
- **Live tests need credentials.** `tests/render.test.ts` and the journal
  conformance suite run only with `RENDER_API_KEY` and `RENDER_WORKSPACE_ID`.
  Without them they report a named skip.
