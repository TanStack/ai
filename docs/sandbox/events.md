---
title: Events & File Hooks
id: events
description: "Stream a harness agent's text, tool calls, reasoning, and file edits to the client, and run server-side hooks on every file change inside the sandbox."
---

When a harness adapter runs inside a [sandbox](./overview), everything it does —
text, reasoning, tool calls, and the files it touches — is observable. This page
covers the two halves of that story: the **stream** the client reads, and the
**file-event hooks** that fire server-side.

## The stream

A harness run produces standard AG-UI `StreamChunk`s, the same shape any
`chat()` run produces:

- **Text** — incremental assistant output.
- **Tool calls** — including bridged [tools](./tools), which surface as ordinary
  tool-call chunks the moment the in-sandbox agent invokes them.
- **Reasoning** — the agent's thinking, where the harness exposes it.
- **Run lifecycle** — run started / finished and related boundaries.

On top of those, the sandbox layer emits namespaced `CUSTOM` events for
sandbox-specifics. The in-sandbox Claude Code adapter emits:

- `claude-code.session-id` — the resumable harness session id.
- `file.changed` — the working-tree `git diff` after the run.
- `sandbox.file` — emitted automatically, once per file create/change/delete,
  whenever a sandbox is active (see [File-event hooks](#file-event-hooks)).

### Reading CUSTOM events on the client

A `CUSTOM` chunk carries a `name` and a `value` of unknown shape, so narrow
`value` with `typeof` / `in` checks before you read its fields — never cast:

```ts
import { stream } from './my-run'

for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'file.changed') {
    const value = chunk.value
    if (value !== null && typeof value === 'object' && 'diff' in value) {
      console.log(value.diff)
    }
  }
}
```

The same pattern reads the auto-emitted `sandbox.file` events:

```ts
import { stream } from './my-run'

for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'sandbox.file') {
    const value = chunk.value
    if (
      value !== null &&
      typeof value === 'object' &&
      'type' in value &&
      'path' in value
    ) {
      console.log('file event', value) // { type, path, timestamp }
    }
  }
}
```

## File-event hooks

Listen to files being created, changed, or deleted inside a sandbox — for
example to watch what the agent edits as it works. The watcher is
provider-agnostic: it uses native OS watching where the provider supports it
(local-process) and falls back to a portable `find` poll everywhere else (Docker
and other exec-only providers), with no extra dependencies or image changes.

There are two places to declare these hooks, with different scopes.

### Sandbox-scoped hooks

Declared directly on `defineSandbox({ hooks })`. They fire **once per file
event**, regardless of how many runs share the sandbox, alongside the
sandbox's own lifecycle callbacks:

```ts
import { defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  hooks: {
    // catch-all: fires for every event
    onFile: (e) => console.log(`[${e.type}] ${e.path}`),
    // type-specific variants
    onFileCreate: (e) => console.log('created', e.path),
    onFileChange: (e) => console.log('changed', e.path),
    onFileDelete: (e) => console.log('deleted', e.path),
    // lifecycle
    onReady: (handle) => console.log('sandbox ready', handle.id),
    onError: (err) => console.error('sandbox error', err),
    onDestroy: () => console.log('sandbox destroyed'),
  },
})
```

### Run-scoped hooks

To handle file events inside a middleware (for example per-request audit
logging), use the `sandbox` hook group on `defineChatMiddleware`. These fire
**per-run**, and each handler receives the current run's
`ChatMiddlewareContext`:

```ts
import { defineChatMiddleware } from '@tanstack/ai-sandbox'
import { db } from './db'

const auditMiddleware = defineChatMiddleware({
  name: 'audit',
  // ctx is the ChatMiddlewareContext for the current run
  sandbox: {
    onFile: (ctx, e) => console.log(ctx.runId, e.type, e.path),
    onFileCreate: (ctx, e) => db.log({ run: ctx.runId, event: e }),
  },
})
```

Both hook groups fire **server-side**. They are independent of the stream: the
engine automatically emits one `CUSTOM` `sandbox.file` event per change into the
stream regardless of whether you register any hooks — so the client can react to
the same edits without extra middleware (see
[Reading CUSTOM events](#reading-custom-events-on-the-client)).

## Disabling file watching

To stop the watcher and suppress `sandbox.file` events for a sandbox entirely,
set `fileEvents: false`:

```ts
import { defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = defineSandbox({
  id: 'quiet-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  fileEvents: false, // watcher not started; no sandbox.file events emitted
})
```

## Debugging

To log sandbox internals — watcher start/stop, event dispatch, lifecycle
transitions — pass the `sandbox` debug category to `chat()`:

```ts
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { withSandbox } from '@tanstack/ai-sandbox'
import { repoSandbox } from './sandbox'
import { messages } from './messages'

chat({
  threadId: 'thread-1',
  adapter: claudeCodeText('sonnet'),
  messages,
  middleware: [withSandbox(repoSandbox)],
  debug: { sandbox: true }, // or `debug: true` for all categories
})
```

## Low-level: `watchWorkspace()`

`watchWorkspace()` is the building block the hooks are built on. Reach for it
when you want the watcher **outside** a `chat()` run:

```ts
import { watchWorkspace } from '@tanstack/ai-sandbox'
import { repoSandbox } from './sandbox'

const handle = await repoSandbox.ensure({ threadId: 'thread-1', runId: 'run-1' })
const watcher = await watchWorkspace(handle, {
  onEvent: (event) => {
    // event.type is 'create' | 'change' | 'delete'
    console.log(`${event.type} ${event.path}`)
  },
  ignore: ['.git', 'node_modules'], // default
})
// …do work outside a chat run…
await watcher.stop()
```

## Related

- [Sandboxes overview](./overview) — where these runs execute.
- [Quick start](./quick-start) — get a sandbox running end to end.
- [Tools](./tools) — bridged host tools that surface as tool-call chunks.
- [Lifecycle &amp; resume](./lifecycle) — when sandboxes are created and torn down.
