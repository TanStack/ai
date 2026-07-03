---
title: Observability
id: observability
order: 10
description: "Run server-side hooks on every file the agent touches, log sandbox internals, and watch a workspace outside a chat() run."
---

The [events stream](./events) is what a *client* reads. This page is the
*server-side* half: hooks that fire on every file the agent touches, sandbox
debug logging, and the low-level watcher you can drive outside a `chat()` run.

## File-event hooks

Listen to files being created, changed, or deleted inside a sandbox — for
example to watch what the agent edits as it works. The watcher is
provider-agnostic: it uses native OS watching where the provider supports it
(local-process) and falls back to a portable `find` poll everywhere else (Docker
and other exec-only providers), with no extra dependencies or image changes.

There are two places to declare these hooks, with different scopes.

### Sandbox-scoped hooks

Declared directly on `defineSandbox({ hooks })`. They fire **once per file
event**, regardless of how many runs share the sandbox, alongside the sandbox's
own lifecycle callbacks:

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
**per-run**, and each handler receives the current run's `ChatMiddlewareContext`:

```ts
import { defineChatMiddleware } from '@tanstack/ai'
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

Both hook groups fire **server-side** and are independent of the stream: the
engine automatically emits one `CUSTOM` [`sandbox.file`](./events#custom-events)
event per change regardless of whether you register any hooks — so the client
can react to the same edits without extra middleware.

## Reading content and diffs in hooks

The event every hook receives isn't just `{ type, path, timestamp }` — it also
carries lazy, git-backed accessors for the file's content:

```ts
interface SandboxFileHookEvent {
  type: "create" | "change" | "delete";
  path: string;
  timestamp: number;
  before(): Promise<string>; // content at the session baseline ('' if new / non-git)
  after(): Promise<string>; // current content ('' if deleted)
  diff(): Promise<string>; // unified patch vs the baseline
}
```

Reach for `diff()` to show what the agent changed — no need to hand-roll a
`git diff` yourself:

```ts
import { defineSandbox } from "@tanstack/ai-sandbox";
import { dockerSandbox } from "@tanstack/ai-sandbox-docker";

const repoSandbox = defineSandbox({
  id: "repo-agent",
  provider: dockerSandbox({ image: "node:22" }),
  hooks: {
    onFileChange: async (e) => {
      const patch = await e.diff();
      console.log(`${e.path} changed:\n${patch}`);
    },
  },
});
```

The same accessors are available on run-scoped hooks, where `e` is the
second argument:

```ts
import { defineChatMiddleware } from "@tanstack/ai";
import { db } from "./db";

const auditMiddleware = defineChatMiddleware({
  name: "audit",
  sandbox: {
    onFileChange: async (ctx, e) => {
      const [before, after] = await Promise.all([e.before(), e.after()]);
      db.log({ run: ctx.runId, path: e.path, before, after });
    },
  },
});
```

**Lazy — path-only hooks pay nothing.** `before()`, `after()`, and `diff()`
are methods, not fields: each one only reads the file or shells out to `git`
when you call it. A hook that only reads `e.path` / `e.type` (like the
catch-all logger in [Sandbox-scoped hooks](#sandbox-scoped-hooks) above)
never touches the filesystem or spawns a process.

**Git session baseline.** At `onReady`, the sandbox snapshots
`git rev-parse HEAD` once, as the session's baseline commit (empty if the
workspace isn't a git repo, or has no commits yet). Every `before()` and
`diff()` call for the rest of the session diffs against that same fixed
baseline, so `onFileChange` always reports the file's **cumulative** change
since the run started — not just the delta since the watcher's last poll.
`after()` always reads the file's current on-disk content, independent of
the baseline. None of the three accessors throw: a deleted file resolves
`after()` to `''` (it still has `before()`); a new file resolves `before()`
to `''` (it still has `after()`); a non-git workspace resolves **both**
`before()` and `after()` to `''` and makes `diff()` fall back to a
synthesized add-patch built from `after()` — except for a `delete` event in
a non-git workspace, where there's nothing to synthesize and `diff()`
resolves to `''`.

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
import { grokBuildText } from '@tanstack/ai-grok-build'
import { withSandbox } from '@tanstack/ai-sandbox'
import { repoSandbox } from './sandbox'
import { messages } from './chat-context'

chat({
  threadId: 'thread-1',
  adapter: grokBuildText('grok-build'),
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

- [Events](./events) — the `CUSTOM` event stream the client reads.
- [Lifecycle & Snapshots](./lifecycle) — when sandboxes are created and torn down.
- [Tools](./tools) — bridged host tools that surface as tool-call chunks.
