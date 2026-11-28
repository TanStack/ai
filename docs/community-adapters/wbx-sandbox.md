---
title: WBX Sandbox
id: wbx-sandbox-adapter
order: 3
description: "Run TanStack AI harnesses in WBX Sandbox Firecracker microVMs with the @wbx-sandbox/tanstack-ai sandbox provider: files, processes, ports, snapshots, and fork."
keywords:
  - tanstack ai
  - wbx sandbox
  - sandbox provider
  - microvm
  - firecracker
  - harness
  - community adapter
---

Pass `wbxSandbox()` from `@wbx-sandbox/tanstack-ai` to `defineSandbox`. The agent then runs in a [WBX Sandbox](https://sandbox.wbx.cz) Firecracker microVM. The WBX Sandbox team maintains the package.

It is a `SandboxProvider`, the same contract as the bundled [providers](../sandbox/providers). Your workspace, policy, and harness do not change.

## 1. Install

The example below uses the Grok Build harness. Install the harness package that you use.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @wbx-sandbox/tanstack-ai @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox
vue: @wbx-sandbox/tanstack-ai @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox
solid: @wbx-sandbox/tanstack-ai @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox
svelte: @wbx-sandbox/tanstack-ai @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox
preact: @wbx-sandbox/tanstack-ai @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox
angular: @wbx-sandbox/tanstack-ai @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox
vanilla: @wbx-sandbox/tanstack-ai @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox
octane: @wbx-sandbox/tanstack-ai @tanstack/ai @tanstack/ai-grok-build @tanstack/ai-sandbox

<!-- ::end:tabs -->

## 2. Set the API key

Put your WBX Sandbox API key in the environment of your server:

```bash
WBXSANDBOX_API_KEY=your-key
```

`wbxSandbox()` reads this variable. You can also pass `apiKey`.

## 3. Run an agent in a microVM

Change the `provider` line of your sandbox definition:

```ts
import { chat } from '@tanstack/ai'
import { GROK_CLI_INSTALL_COMMAND, grokBuildText } from '@tanstack/ai-grok-build'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  githubRepo,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { wbxSandbox } from '@wbx-sandbox/tanstack-ai'

const repoSandbox = defineSandbox({
  id: 'bug-fixer',
  provider: wbxSandbox({ template: 'node' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/buggy-app' }),
    packageManager: 'pnpm',
    setup: [GROK_CLI_INSTALL_COMMAND, 'corepack enable', 'pnpm install'],
    secrets: createSecrets({
      XAI_API_KEY: process.env.XAI_API_KEY ?? '',
    }),
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup', keepAlive: '30m' },
})

const stream = chat({
  threadId: 'bug-fix-1',
  adapter: grokBuildText('grok-build'),
  messages: [
    { role: 'user', content: 'The tests fail. Find the bug and fix it.' },
  ],
  middleware: [withSandbox(repoSandbox)],
})

for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    process.stdout.write(chunk.delta)
  }
}
```

The agent starts when you read the stream. It clones the repo, installs the dependencies, and works in its own microVM. If the sandbox of this thread is gone later, the framework restores the snapshot from after setup and skips the install.

## What the provider supports

Every capability flag is `true`:

- **Processes:** each command leads its own process group in the VM. `kill()` and an aborted `exec` stop the whole group. A spawned process has a writable stdin. `killableProcesses` is measured against production.
- **Snapshots and fork:** `snapshot()` and `fork()` copy the disk. Memory and running processes are not copied.
- **Resume:** resume by id wakes a sleeping, paused, or archived sandbox. A deleted sandbox resumes as `null`.
- **Ports:** `ports.connect(port)` returns an HTTPS URL. The channel carries the `X-WBX-Token` header in `headers`.
- **Network:** `policy.capabilities.network: 'deny'` creates the sandbox with no network.

The package runs the shared journal conformance suite from `@tanstack/ai-sandbox/testkit` against the real API.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `template` | `base` | Image of new sandboxes, for example `node`, `go`, or `rust`. |
| `timeoutSeconds` | `1800` | Lifetime. Then `onTimeout` decides what happens. |
| `onTimeout` | `'kill'` | `'kill'` deletes the sandbox. `'pause'` keeps it for `resume`. |
| `network` | full internet | `{ mode: 'allowlist', allow: [...] }` or `{ mode: 'none' }`. |
| `workdir` | `/home/user/workspace` | Where the `/workspace` virtual root maps in the VM. |

A sandbox with no commands for 10 minutes falls asleep with no compute cost, and the next command wakes it. The other options are in the [package README](https://github.com/WBX-Sandbox/tanstack-ai#configuration).

Cloud sandboxes run remotely, so [bridged tools](../sandbox/tools) need the ngrok tunnel in local dev.
