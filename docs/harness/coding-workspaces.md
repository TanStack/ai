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
import { defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import {
  hostBackend,
  workspaceRoot,
  workspaceTools,
} from '@tanstack/ai-harness/plugins/coding'
import { openaiText } from '@tanstack/ai-openai'

export const coder = defineHarness({
  name: 'acme/coder',
  adapter: openaiText('gpt-6.1-sol'),
  plugins: () => [
    permissions(),
    workspaceTools({
      workspace: {
        bind: async ({ run }) => {
          const root = workspaceRoot('/srv/workspaces', run.tenantId ?? 'default', run.threadId)
          await mkdir(root, { recursive: true })
          return { ...hostBackend, root }
        },
      },
    }),
  ],
})
```

- The tools call `bind` once for each thread, before the first turn or at the first tool call. If `bind` throws, the next turn calls it again.
- A client sends the thread id. Do not put it in a path with `join` or a template string: an id like `../other-tenant/t-1` leads into another folder. `workspaceRoot` encodes each part, so each id gets its own folder in `/srv/workspaces`, and it throws for a path that leaves it.
- The `root` that `bind` gives is the boundary of the file tools. A path outside it is refused. With `outside: 'ask'`, a rule that allows the path, or `bypass` mode, lets a call use it. No approval can cover it, because the root is not known before the call. The `cwd` thread setting must stay inside it.
- The tools resolve every link with `realpath` before they read or write, while they hold the lock on the file. So a link in one thread cannot lead into the folder of another thread.
- The session log keeps a `harness.workspace.bound` record with the place of the workspace. [Move a thread to another server](#5-move-a-thread-to-another-server) uses it.
- Put `workspaceTools()` before [`snapshots()`](./snapshots) and [`formatter()`](./coding-tools-backends#format-each-file-after-a-write). Then they work in the workspace of each thread, and their `root` is optional.

A folder on the server is not isolation: `bash` runs as the user of your server (see [Keep server secrets out of commands](#2-keep-server-secrets-out-of-commands)). When many users share the server, give each thread a sandbox. Create it in `bind`, and give the backend `owned: true`. Then the thread owns the sandbox:

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

- A session close (an idle close, a deploy, or a move to another server) closes the backend with `'moved'`. The sandbox stays, so the next server can [reattach](#a-sandbox) it.
- [`host.sessions.delete`](./lifecycle#delete-a-thread-for-good) ends the thread. The host reattaches the sandbox and closes it with `'closed'`, so it is destroyed. The host that deletes must know the harness: it opened the harness, or it has the harness in its [`harnesses`](./lifecycle#delete-a-thread-for-good) option. Else it warns, and the sandbox stays.

## 2. Keep server secrets out of commands

A command gets only a few variables of the server process:

- `PATH`, `HOME`, `LANG`, `LC_ALL`, `TMPDIR`, `TEMP`, and `TMP`.
- On Windows also `SystemRoot`, `ComSpec`, `PATHEXT`, `WINDIR`, and `USERPROFILE`.
- `AGENT=1`, so a tool can see that an agent runs it.

Provider keys, `DATABASE_URL`, and the other variables of the server are not in the env of a command. The same rule applies to `bash`, `rg`, `git`, and the formatters. Git also runs without the hooks and the `fsmonitor` of the project.

With `hostBackend`, and with the local-process sandbox, this short env and the `root` are defense in depth. They are not isolation:

- A command runs as the user of your server. `bash` can read every file that this user can read, for example the `.env` file of the server, or the folder of another thread.
- `bash` can also read the env of each process of that user, for example `/proc/<pid>/environ` of the server.

For users that you do not trust, use [a sandbox for each thread](#1-give-each-thread-its-own-workspace).

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

- A write holds a lock on the file. The lock is shared by every session on this server, and it is keyed by the sandbox (or this server) and the real path of the file. Two roots that lead to one folder share the lock. Two sandboxes with the same root do not.
- `write_file`, `edit_file`, and `patch` fail when the file changed after the tool read it in the same agent run. A subagent and its lead each check their own read. The model gets `src/app.ts changed since it was read. Read it again before you edit it.`, reads the file again, and tries again.
- The check compares the size and the time of the last change. A sandbox gives no change time, so there only a change of size is seen.

## 4. Watch background jobs

With `background: true`, `bash` returns at once with a job id like `bash-1`. Two limits keep jobs small:

- At most 8 background jobs run at a time in a session. One more gives the model a tool error. Set another limit with `maxJobs`. A running command that `session.moveToolCallToBackground()` moves counts too, and at the limit it does not move.
- Each job keeps the newest 1 MiB of its output.

When a job ends, the model gets a note, and the wake turn runs as the user whose run started the job.

To show the jobs that run now, for example in a status bar, call `session.jobs()`. A [view](./lifecycle#read-a-thread-without-a-session) of `host.observe` has `jobs()` too:

```ts group=harness-coding-workspaces
import type { HarnessSession } from '@tanstack/ai-harness'

export function listJobs(session: HarnessSession) {
  for (const job of session.jobs()) {
    console.log(`${job.jobId}: ${job.label ?? 'job'}, started by ${job.user?.id ?? 'the agent'}`)
  }
}
```

Each entry has:

- `jobId` and `threadId`: the job, and the thread of the workspace that runs it.
- `label`: the command, or the name of the tool that `session.moveToolCallToBackground()` moved.
- `user` and `startedAt`: who moved the call to the background, and when the job started.
- `running`: `true` when this host runs the job. A job of another host, or one that a crash stopped, has `false`.
- `backendId`: the id of the process in the workspace backend, when it has one.

`session.jobs()` reads the log, so it also lists the jobs of other hosts. After a restart, it lists a job until the host notes that the job stopped.

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
  ownership: { hostId: process.env.POD_NAME ?? 'web-1' },
})
```

- With `hostId`, a thread that uses a local folder is pinned to this server. Workers on other servers do not take it, also while the thread is idle.
- Another server that opens the thread refuses its tool calls with `The workspace of this thread is <root> on the host web-1. Only that host can continue the thread.`
- Keep the id the same after a restart. On Kubernetes, use the pod name of a StatefulSet. Do not use `HOSTNAME` of a Deployment pod: it changes at each restart, and the threads of the old pod stay pinned to it.
- Without `hostId`, threads are not pinned, and every server calls `bind` again. Use this when every server sees the same folder, for example on a shared disk.

The server sends a heartbeat to the log store each `ownership.renewEveryMs`. When no heartbeat came for `ownership.expiresAfterMs` (default 30 seconds), its pins do not count. Then the next server that gets work for the thread calls `reattach` with the old binding. Give a new workspace there, for example a fresh clone, to move the thread. Keep a restart shorter than `ttlMs`, or raise `ttlMs`.

To move the threads of a server at once, unpin them with `host.unpin`. Its ownership must have expired first:

```ts group=harness-coding-workspaces
await host.unpin({ harness: coder, threadId: 'fix-login' })
```

### After a move

- Background jobs do not move. At the next tool call of the thread, the new server stops each job that the old server left running. The model gets the note `Background job bash-1 was stopped: it ran on a host before the session moved to this one.`
- A job that the backend cannot check stays in the log, and the model gets `Background job bash-1 may still run: it ran on a host before this one, and this host cannot stop it.` For example, `hostBackend` needs `ps` to check a job.
- `/undo`, `/redo`, and a revert work on the new server when it reaches the same snapshot repository. See [Undo a turn](./snapshots#on-more-than-one-server).
- [Coding agents](./coding-agents) run only on the server that owns the log. So two servers never run the agents of one shared workspace at the same time.

## What you have now

- A folder or a sandbox for each thread, with its root as the boundary of every tool.
- Commands that get only a short env, and a sandbox for users that you do not trust.
- Agents that share a folder and never lose an edit.
- Events for every background job, and a limit on how many run.
- Threads that move to another server with their sandbox, or stay on the server that has their folder.
