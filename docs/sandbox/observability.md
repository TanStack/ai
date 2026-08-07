---
title: Observability (Advanced)
id: observability
order: 10
description: "Server-side file hooks, sandbox debug logging, and watchWorkspace outside chat()."
---

If you need **server-side** reactions to agent file edits → hooks on `defineSandbox` or middleware.

Client stream → [Events](./events).

## Sandbox-scoped hooks

Fire once per file event (shared across runs on that sandbox):

```ts
import { defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  hooks: {
    onFile: (e) => console.log(`[${e.type}] ${e.path}`),
    onFileCreate: (e) => console.log('created', e.path),
    onFileChange: (e) => console.log('changed', e.path),
    onFileDelete: (e) => console.log('deleted', e.path),
    onReady: (handle) => console.log('sandbox ready', handle.id),
    onError: (err) => console.error('sandbox error', err),
    onDestroy: () => console.log('sandbox destroyed'),
  },
})
```

## Run-scoped hooks

Per-run; second arg is the event; first is `ChatMiddlewareContext`:

```ts
import { defineChatMiddleware } from '@tanstack/ai'
import { db } from './db'

const auditMiddleware = defineChatMiddleware({
  name: 'audit',
  sandbox: {
    onFile: (ctx, e) => console.log(ctx.runId, e.type, e.path),
    onFileCreate: (ctx, e) => db.log({ run: ctx.runId, event: e }),
  },
})
```

Hooks are independent of the stream: engine still emits `CUSTOM` [`sandbox.file`](./events#custom-events) for the client.

## Content and diffs in hooks

```ts
interface SandboxFileHookEvent {
  type: 'create' | 'change' | 'delete'
  path: string
  timestamp: number
  before(): Promise<string> // baseline ('' if new / non-git)
  after(): Promise<string> // current ('' if deleted)
  diff(): Promise<string> // unified patch vs baseline
}
```

Lazy — path-only hooks pay nothing. Call `diff()` when you need the patch:

```ts
import { defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  hooks: {
    onFileChange: async (e) => {
      const patch = await e.diff()
      console.log(`${e.path} changed:\n${patch}`)
    },
  },
})
```

**Baseline:** at `onReady`, snapshot `git rev-parse HEAD`. All `before()`/`diff()` use that fixed commit (cumulative since run start). `after()` is always on-disk current.

| Case | Accessors |
| --- | --- |
| Non-git | both `''`; `diff()` synthesized add-patch from `after()` (delete → `''`) |
| Untracked create | synthesized add-patch (git ignore untracked for `git diff`) |
| Git-ignored (e.g. `.env`) | event fires; `diff()` → `''` (no content leak) |
| Failures | fall back to `''`, **logged** under `errors` / `sandbox` debug |

## Disable file watching

```ts
import { defineSandbox } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = defineSandbox({
  id: 'quiet-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  fileEvents: false,
})
```

## Debug

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
  debug: { sandbox: true }, // or debug: true for all
})
```

## Low-level `watchWorkspace()`

Outside a `chat()` run:

```ts
import { watchWorkspace } from '@tanstack/ai-sandbox'
import { repoSandbox } from './sandbox'

const handle = await repoSandbox.ensure({ threadId: 'thread-1', runId: 'run-1' })
const watcher = await watchWorkspace(handle, {
  onEvent: (event) => {
    console.log(`${event.type} ${event.path}`)
  },
  ignore: ['.git', 'node_modules'],
})
await watcher.stop()
```

## Related

[Events](./events) · [Lifecycle](./lifecycle) · [Tools](./tools)
