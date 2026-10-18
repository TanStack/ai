---
title: Run the coding tools for many threads
id: harness-coding-workspaces
order: 7
description: "Give each thread of a coding agent its own folder or sandbox, keep server secrets out of commands, let agents share files safely, watch background jobs, and move a thread to another server."
keywords:
  - tanstack ai
  - harness
  - coding agent
  - workspace tools
  - sandbox
  - multi-tenant
  - background jobs
---

Your server runs coding agents for many users. Each thread must work in its own folder or sandbox. A command must not see the API keys of your server. Two agents in one folder must not lose each other's edits. And a thread must continue when another server takes it.

`workspace: { bind }` gives each thread its own workspace. The session log keeps where that workspace is, so the next server finds it again.

## 1. Give each thread its own workspace

Pass `workspace` to `workspaceTools()` in place of `root`. `bind` gets the run, and gives a backend with its `root`:

```ts group=harness-coding-workspaces
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { hostBackend, workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { openaiText } from '@tanstack/ai-openai'

export const coder = defineHarness({
  name: 'acme/coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    permissions(),
    workspaceTools({
      workspace: {
        bind: async ({ run }) => {
          const root = join('/srv/workspaces', run.tenantId ?? 'default', run.threadId)
          await mkdir(root, { recursive: true })
          return { ...hostBackend, root }
        },
      },
    }),
  ],
})
```

- The tools call `bind` once for each thread, before the first turn or at the first tool call. If `bind` throws, the next turn calls it again.
- The `root` that `bind` gives is the boundary of every tool. A path outside it is refused. With `outside: 'ask'`, a rule that allows the path, or `bypass` mode, lets a call use it. No approval can cover it, because the root is not known before the call. The `cwd` thread setting must stay inside it.
- The tools resolve every link with `realpath` before they read or write, while they hold the lock on the file. So a link in one thread cannot lead into the folder of another thread.
- The session log keeps a `harness.workspace.bound` record with the place of the workspace. [Move a thread to another server](#5-move-a-thread-to-another-server) uses it.

For a sandbox per thread, create it in `bind`, and give the backend `owned: true`. Then the sandbox is destroyed when the session closes:

```ts group=harness-coding-workspaces
import { sandboxWorkspaceBackend } from '@tanstack/ai-sandbox/harness'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const docker = dockerSandbox({ image: 'node:22' })

export const sandboxed = workspaceTools({
  workspace: {
    bind: async () => ({
      ...sandboxWorkspaceBackend(await docker.create({}), { owned: true }),
      root: '/workspace',
    }),
  },
})
```

## 2. Keep server secrets out of commands

A command gets only a few variables of the server process:

- `PATH`, `HOME`, `LANG`, `LC_ALL`, `TMPDIR`, `TEMP`, and `TMP`.
- On Windows also `SystemRoot`, `ComSpec`, `PATHEXT`, `WINDIR`, and `USERPROFILE`.
- `AGENT=1`, so a tool can see that an agent runs it.

Provider keys, `DATABASE_URL`, and every other variable stay in the server. The same rule applies to `bash`, `rg`, `git`, and the formatters. Git also runs without the hooks and the `fsmonitor` of the project.

To give commands a variable, add it to the `env` of the backend calls:

```ts group=harness-coding-workspaces
import type { WorkspaceBackend } from '@tanstack/ai-harness/plugins/coding'

const extra = { NPM_TOKEN: 'npm_read_only_token' }
const { spawn } = hostBackend

const withToken: WorkspaceBackend = {
  ...hostBackend,
  exec: (command, options) =>
    hostBackend.exec(command, { ...options, env: { ...options?.env, ...extra } }),
  spawn:
    spawn &&
    ((command, options) =>
      spawn(command, { ...options, env: { ...options?.env, ...extra } })),
}

export const withTokenTools = workspaceTools({ root: '/srv/repo', backend: withToken })
```

`exec` runs the foreground commands. `spawn` runs the background commands.

## 3. Let agents share a folder

Two agents, or two sessions, can work in the same folder. No edit is lost:

- A write holds a lock on the file. The lock is shared by every session on this server, and it is keyed by the root and the real path of the file.
- `write_file`, `edit_file`, and `patch` fail when the file changed after the tool read it. The model gets `src/app.ts changed since it was read. Read it again before you edit it.`, reads the file again, and tries again.
- The check compares the size and the time of the last change. A sandbox gives no change time, so there only a change of size is seen.

## 4. Watch background jobs

With `background: true`, `bash` returns at once with a job id like `bash-1`. Two limits keep jobs small:

- At most 8 background jobs run at a time in a session. One more gives the model a tool error. Set another limit with `maxJobs`.
- Each job keeps the newest 1 MiB of its output.

Each job sends events. Listen for them in a plugin:

```ts group=harness-coding-workspaces
import { definePlugin } from '@tanstack/ai-harness'
import { JobEnded, JobOutput, JobStarted } from '@tanstack/ai-harness/plugins/coding'

export const jobLog = definePlugin({
  name: 'acme/job-log',
  setup: (ctx) => {
    ctx.on(JobStarted, (job) => console.log(`${job.jobId} started: ${job.command}`))
    ctx.on(JobOutput, (job) => process.stdout.write(job.output))
    ctx.on(JobEnded, (job) => console.log(`${job.jobId} ended: ${job.exitCode}`))
  },
})
```

A client gets each event as a `CUSTOM` event with the name `harness.plugin.event`. Its value is `{ plugin, name, value }`:

```ts group=harness-coding-workspaces-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { coder } from './harness'

const client = createHarnessClient<typeof coder>({
  url: '/api/harness',
  threadId: 'fix-login',
})

for await (const { event } of client.events()) {
  if (event.type !== 'CUSTOM' || event.name !== 'harness.plugin.event') continue
  const { value } = event
  if (typeof value !== 'object' || value === null) continue
  if (!('name' in value) || value.name !== 'tanstack/workspace-tools:job-output') continue
  if ('value' in value) console.log(value.value)
}
```

The coding plugins send these events:

| Name | When |
| --- | --- |
| `tanstack/workspace-tools:job-started` | A background job started. |
| `tanstack/workspace-tools:job-output` | New output of a job. At most one event each 250 ms, with at most the newest 64 KiB. |
| `tanstack/workspace-tools:job-ended` | A job ended, after its last output event. |
| `tanstack/workspace-tools:stranded` | The workspace of the thread is gone. See below. |
| `tanstack/snapshots:failed` | A snapshot failed. The turn goes on. |

The formatter also sends `tanstack/formatter:rewrote` and `tanstack/formatter:failed`. See [Format each file after a write](./coding-tools-backends#format-each-file-after-a-write).

## 5. Move a thread to another server

One server owns a thread at a time. When it stops, another server takes the thread (see [One host drives a thread](./durable-sessions#one-host-drives-a-thread)). What happens to the workspace depends on where it is.

### A sandbox

The log keeps the provider and the id of the sandbox. The next server calls `reattach` in place of `bind`. Resume the sandbox there:

```ts group=harness-coding-workspaces
export const movable = workspaceTools({
  workspace: {
    bind: async () => ({
      ...sandboxWorkspaceBackend(await docker.create({}), { owned: true }),
      root: '/workspace',
    }),
    reattach: async ({ binding }) => {
      if (binding.kind === 'host') return 'pinned'
      if (binding.provider !== 'docker') return 'gone'
      const handle = await docker.resume({ id: binding.sandboxId })
      if (!handle) return 'gone'
      return { ...sandboxWorkspaceBackend(handle, { owned: true }), root: binding.root }
    },
  },
})
```

- Give the workspace back to continue in the same files.
- Give `'gone'` when the sandbox is gone. Then each tool call of the thread fails with `The workspace of this thread, /workspace in the docker sandbox <id>, is gone, so the tools cannot work on it.`, and the tools send `tanstack/workspace-tools:stranded`. The session also sends a `harness.stranded` event, for clients that do not know the plugin. See the [event catalog](./protocol#event-catalog).
- Without `reattach`, a sandbox counts as `'gone'`.

### A folder on one server

A folder on the disk of one server cannot move. Give each server a stable id:

```ts group=harness-coding-workspaces
import { createHarnessHost } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'

const host = createHarnessHost({
  persistence: memoryPersistence(),
  ownership: { hostId: process.env.HOSTNAME ?? 'web-1' },
})
```

- With `hostId`, a thread that uses a local folder is pinned to this server. Workers on other servers do not take it.
- Another server that opens the thread refuses its tool calls with `The workspace of this thread is <root> on the host web-1. Only that host can continue the thread.`
- Keep the id the same after a restart, for example the machine or pod name.
- Without `hostId`, threads are not pinned, and every server calls `bind` again. Use this when every server sees the same folder, for example on a shared disk.

### After a move

- Background jobs do not move. At the next tool call of the thread, the new server stops each job that the old server left running. The model gets the note `Background job bash-1 was stopped: it ran on a host before the session moved to this one.`
- `/undo`, `/redo`, and a revert work on the new server when it reaches the same snapshot repository. See [Undo a turn](./snapshots#on-more-than-one-server).
- [Coding agents](./coding-agents) run only on the server that owns the log. So two servers never run the agents of one shared workspace at the same time.

## What you have now

- A folder or a sandbox for each thread, with its root as the boundary of every tool.
- Commands that never see the secrets of your server.
- Agents that share a folder and never lose an edit.
- Events for every background job, and a limit on how many run.
- Threads that move to another server with their sandbox, or stay on the server that has their folder.
