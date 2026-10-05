---
title: Build a Sandbox Provider (Advanced)
id: sandbox-build-a-provider
order: 15
description: "Run sandboxes on a platform that TanStack AI has no provider for: implement the SandboxProvider contract, declare what it can do, and prove it with the conformance suites."
keywords:
  - SandboxProvider
  - SandboxHandle
  - sandbox capabilities
  - sandbox conformance suite
  - runJournalConformance
---

Your agent must run on a platform that TanStack AI has no provider for. The platform
can be your own VM fleet, an internal container service, or a cloud that you already
use. A provider is the small piece that creates, finds, and destroys sandboxes on that
platform. Write one against the `SandboxProvider` contract. Then prove it with the same
conformance suites that the bundled providers run.

## 1. Write the provider

A provider has a `name` and four methods: `capabilities`, `create`, `resume`, and
`destroy`. `create` and `resume` give back a `SandboxHandle`, the object that the
agent, the workspace setup, and the journal use. This provider wraps a platform SDK
called `vms`:

```ts
import {
  UnsupportedCapabilityError,
  createExecBackedGit,
} from '@tanstack/ai-sandbox'
import type {
  SandboxCapabilities,
  SandboxHandle,
  SandboxProcess,
  SandboxProvider,
} from '@tanstack/ai-sandbox'
// The SDK of your platform.
import { vms } from './vm-client'
import type { Vm } from './vm-client'

const capabilities: SandboxCapabilities = {
  fs: true,
  exec: true,
  env: true,
  backgroundProcesses: true,
  durableFilesystem: true,
  // Not measured yet, so false. See step 2.
  killableProcesses: false,
  writableStdin: false,
  ports: false,
  snapshots: false,
  networkPolicy: false,
  fork: false,
}

function toHandle(vm: Vm): SandboxHandle {
  const proc: SandboxProcess = {
    exec: (command, options) => vm.exec(command, options),
    spawn: (command, options) => vm.spawn(command, options),
  }
  return {
    id: vm.id,
    provider: 'my-vm',
    workspaceRoot: '/workspace',
    capabilities,
    fs: {
      read: (path) => vm.files.readText(path),
      readBytes: (path) => vm.files.readBytes(path),
      write: (path, data) => vm.files.write(path, data),
      list: (path) => vm.files.list(path),
      mkdir: (path) => vm.files.mkdir(path),
      remove: (path) => vm.files.remove(path),
      rename: (from, to) => vm.files.rename(from, to),
      exists: (path) => vm.files.exists(path),
    },
    git: createExecBackedGit(proc, '/workspace'),
    process: proc,
    ports: {
      connect: async () => {
        throw new UnsupportedCapabilityError('my-vm', 'ports')
      },
    },
    env: { set: (vars) => vm.setEnv(vars) },
    destroy: () => vm.delete(),
  }
}

export function myVmSandbox(): SandboxProvider {
  return {
    name: 'my-vm',
    capabilities: () => capabilities,
    create: async (input) =>
      toHandle(await vms.create({ name: input.id, env: input.env })),
    resume: async ({ id }) => {
      const vm = await vms.find(id)
      return vm ? toHandle(vm) : null
    },
    destroy: ({ id }) => vms.delete(id),
  }
}
```

Each part has one rule:

- `create`: if your platform can name a sandbox, use `input.id` as the name. Then a thread always finds the same sandbox again.
- `resume`: find a sandbox by its id. If the sandbox is gone, return `null`.
- `destroy`: delete a sandbox by its id. You get only the id here, not a handle.
- `exec` and `spawn`: run the command string through a POSIX shell. The journal needs `>>` and `tail -c +N -f`.
- `git`: `createExecBackedGit` runs `git` through your `exec`. If your platform has its own git API, you can use that instead.

## 2. Declare what it can do

`fs` and `exec` are always `true`. Each other flag is a promise to the code that uses
your sandbox. Set a flag to `true` only after you saw it work on a real sandbox.

- `killableProcesses`: `kill()` and the `signal` of `spawn` stop the process inside the sandbox, with its children. A wrong `true` leaves one `tail -f` running for each run.
- `backgroundProcesses`: a process from `spawn` keeps running after the call returns. With `killableProcesses`, the journal streams the output of a run. If one of the two is `false`, the journal reader polls the file in a loop.
- `writableStdin`: `stdin.write` of a spawned process works. If it is `false`, a harness writes its prompt to a file and redirects the file.
- `snapshots`: add `restoreSnapshot` to the provider and `snapshot` to the handle.
- `fork`: add `fork` to the handle.

The [capability table](./providers#capabilities) has the other flags. A call to an
optional feature that you do not support throws `UnsupportedCapabilityError`, as
`ports.connect` does above.

## 3. Prove it with the conformance suites

`@tanstack/ai-sandbox/testkit` has three suites that run against a real sandbox:

- `runJournalConformance`: the shell runs `>>` and `tail -f`. On a killable provider, `kill()` stops the process inside the sandbox.
- `runTakeoverConformance`: a second host takes over a run and gets the rest of the output once, with no duplicate lines.
- `runReaperConformance`: the sweeps delete the journals that they must delete and keep the others. They never touch a run that still writes output.

The suites import `vitest`, so add it to your dev dependencies. Then add one test
file for each suite:

```ts
// tests/journal.conformance.test.ts
import { runJournalConformance } from '@tanstack/ai-sandbox/testkit'
import { myVmSandbox } from '../src'

runJournalConformance({
  name: 'my-vm',
  createHandle: async () => {
    const handle = await myVmSandbox().create({})
    return { handle, dispose: () => handle.destroy() }
  },
  // killableProcesses is false, so the journal reads in a loop.
  followUnsupported: { reason: 'kill() is not measured yet' },
})
```

`runTakeoverConformance` and `runReaperConformance` take the same `name` and
`createHandle`. Each suite also takes declarations. Add one only if it is true for
your provider:

- `followUnsupported`: on the journal and reaper suites, when `backgroundProcesses` or `killableProcesses` is `false`. The suites compare it to a live sandbox, so a wrong value fails.
- `mtimeListUnsupported`: on the reaper suite, when the shell has no GNU `stat -c`. Then the age-gate cases skip.
- `unsupported`: on any suite, when the provider cannot do what the suite needs.

A declaration puts your reason in the test output, so a missing feature never shows
as a silent pass. Use `unsupported` for a missing API key too:

```ts
// tests/takeover.conformance.test.ts
import { runTakeoverConformance } from '@tanstack/ai-sandbox/testkit'
import { myVmSandbox } from '../src'

const apiKey = process.env.MY_VM_API_KEY

runTakeoverConformance({
  name: 'my-vm',
  createHandle: async () => {
    const handle = await myVmSandbox().create({})
    return { handle, dispose: () => handle.destroy() }
  },
  ...(apiKey
    ? {}
    : { unsupported: { reason: 'no MY_VM_API_KEY in the environment' } }),
})
```

Run them with `npx vitest run tests`. Each case starts a real sandbox and a real agent
process, so the suites give a case up to 3 minutes before it fails.

## 4. Use it

Give the provider to `defineSandbox`, the same as a bundled one:

```ts
import { defineSandbox } from '@tanstack/ai-sandbox'
import { myVmSandbox } from './my-vm-sandbox'

export const repoSandbox = defineSandbox({
  id: 'bug-fixer',
  provider: myVmSandbox(),
})
```

## What you have now

- A provider that runs the agent on your own platform.
- Capability flags that you measured, so the journal and cancel do the right thing.
- Conformance suites that fail when the provider breaks a promise.

Next: keep runs alive through a lost connection with [Durable Runs](./durable-runs).
