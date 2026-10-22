---
title: Observability (Advanced)
id: observability
order: 10
description: "Run server-side code on every file the agent creates, changes, or deletes, read the diff, log sandbox internals, and watch a workspace outside a chat() run."
---

Observe sandbox file changes on the server. Log each edit, store an audit trail, or post the diff.

File hooks do that. Declare them on the sandbox, and they run on the server for every file the agent touches.

## Log every change the agent makes

1. Add `hooks` to `defineSandbox`.
2. Read `e.path` and `e.type`, and call `e.diff()` when you want the patch.

```ts
import { defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

export const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  hooks: {
    // Every event.
    onFile: (e) => console.log(`[${e.type}] ${e.path}`),
    // Changes only, with the patch.
    onFileChange: async (e) => {
      const patch = await e.diff()
      console.log(`${e.path} changed:\n${patch}`)
    },
  },
})
```

Run the agent with this sandbox. Each edit prints its path, and each change prints its unified diff.

## How it works

- **A watcher starts with the sandbox.** On local-process it uses native OS file watching. On Docker and other exec-only providers, it polls with a portable `find`. No extra dependencies, no image changes.
- **Sandbox hooks fire once per file event**, however many runs share the sandbox.
- **Content is lazy.** `before()`, `after()`, and `diff()` are methods. They read the file or call `git` only when you call them. A hook that reads only `e.path` and `e.type` costs nothing.
- **The client gets events too.** The engine emits one `CUSTOM` [`sandbox.file`](./events#custom-events) event per change, with or without hooks.

## Advanced

### Sandbox-scoped hooks

All hooks on `defineSandbox({ hooks })`:

| Hook | Fires |
| --- | --- |
| `onFile` | For every file event. |
| `onFileCreate`, `onFileChange`, `onFileDelete` | For one event type. |
| `onReady(handle)` | When the sandbox is ready. |
| `onError(err)` | When the sandbox fails. |
| `onDestroy()` | When the sandbox is destroyed. |

A hook that throws is logged under the `errors` category. It does not break the run.

### Run-scoped hooks

For per-request work, such as an audit log keyed by run, use the `sandbox` hook group on `defineChatMiddleware`. These hooks fire **per run**, and each one gets the run's `ChatMiddlewareContext` first:

```ts
import { defineChatMiddleware } from '@tanstack/ai'
import { db } from './db'

export const auditMiddleware = defineChatMiddleware({
  name: 'audit',
  sandbox: {
    onFile: (ctx, e) => console.log(ctx.runId, e.type, e.path),
    onFileChange: async (ctx, e) => {
      const [before, after] = await Promise.all([e.before(), e.after()])
      db.log({ run: ctx.runId, path: e.path, before, after })
    },
  },
})
```

Both hook groups run on the server, separate from the stream.

### What `before`, `after`, and `diff` return

The event every hook gets:

```ts
interface SandboxFileHookEvent {
  type: 'create' | 'change' | 'delete'
  path: string
  timestamp: number
  before(): Promise<string> // content at the session baseline
  after(): Promise<string> // current content
  diff(): Promise<string> // unified patch against the baseline
}
```

At `onReady`, the sandbox runs `git rev-parse HEAD` once and keeps that commit as the session baseline. If the workspace is not a git repo, or has no commits, the baseline is empty. Every `before()` and `diff()` in the session compares to that same baseline. So `onFileChange` reports the **total** change since the run started, not the change since the last poll. `after()` always reads the file as it is on disk now.

| Case | `before()` | `after()` | `diff()` |
| --- | --- | --- | --- |
| Tracked file, changed | Baseline content | Current content | Patch against the baseline |
| Tracked file, same as baseline | Baseline content | Current content | `''` |
| New untracked file, on create and on every later edit | `''` | Current content | A synthesized add-patch from `after()` |
| Deleted file | Baseline content | `''` | Delete patch |
| Non-git workspace | `''` | `''` | A synthesized add-patch from `after()`. `''` for a delete. |
| Untracked, git-ignored file (a `.env`, a credentials file) | `''` | Current content | `''`, so its content never reaches the diff feed. The event still fires. |

`git diff` ignores untracked files. That is why a file the agent creates gets the synthesized add-patch on every later edit too: it never streams an empty diff.

The accessors never throw. A failed `git`, `exec`, or file read falls back to `''` (the watcher keeps its last snapshot). Each failure is logged first:

- **Real faults** go to the `errors` category, which is on by default: a failed `git diff`, an unreadable file, a `find` poll that exits non-zero, a lost git baseline.
- **Expected empty values** go to the `sandbox` debug category: for example, `before()` of a new file. Turn it on with [`debug`](#debugging).

### Turn off file watching

Set `fileEvents: false`. The watcher does not start, and no `sandbox.file` events are sent:

```ts
import { defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

export const quietSandbox = defineSandbox({
  id: 'quiet-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  fileEvents: false,
})
```

To also send a `sandbox.file.diff` event per change to the client, set `fileEvents: { diff: true }`. See [Events](./events).

### Debugging

To log sandbox internals (watcher start and stop, event dispatch, lifecycle steps), pass the `sandbox` debug category to `chat()`:

```ts
import { chat, chatParamsFromRequest, toServerSentEventsResponse } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { repoSandbox } from './sandbox'

export async function POST(request: Request) {
  const { messages, threadId } = await chatParamsFromRequest(request)
  const stream = chat({
    adapter: grokBuildText('grok-build'),
    messages,
    threadId,
    middleware: [withSandbox(repoSandbox)],
    debug: { sandbox: true }, // or `debug: true` for every category
  })
  return toServerSentEventsResponse(stream)
}
```

### Watch a workspace outside a run

The hooks are built on `watchWorkspace()`. Use it directly when you want the watcher outside a `chat()` run:

```ts
import { watchWorkspace } from '@tanstack/ai-sandbox'
import { repoSandbox } from './sandbox'

const handle = await repoSandbox.ensure({ threadId: 'thread-1', runId: 'run-1' })
const watcher = await watchWorkspace(handle, {
  onEvent: (event) => {
    // event.type is 'create' | 'change' | 'delete'
    console.log(`${event.type} ${event.path}`)
  },
})

// Do your work here, then stop the watcher.
await watcher.stop()
```

| Option | Default | What it does |
| --- | --- | --- |
| `onEvent` | required | Called for each file event. |
| `root` | `/workspace` | The directory to watch. |
| `intervalMs` | `700` | Poll interval, for the `find` fallback only. |
| `ignore` | `['.git', 'node_modules']` | Skip any path that contains `/<entry>/`. |
| `signal` | none | Stop watching when it aborts. |
