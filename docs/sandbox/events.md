---
title: Events
id: events
order: 9
description: "Everything a harness agent does inside a sandbox — text, tool calls, reasoning, session ids, and file edits — streams back as AG-UI chunks plus namespaced CUSTOM events."
---

When a harness adapter runs inside a [sandbox](./overview), everything it does is
observable on the `chat()` stream: the same AG-UI `StreamChunk`s any `chat()` run
produces, plus namespaced `CUSTOM` events for sandbox- and harness-specifics.

This page is about the **stream the client reads**. To run server-side callbacks
on file changes, or to log sandbox internals, see [Observability](./observability).

## The stream

A harness run produces standard AG-UI `StreamChunk`s:

- **Text** — incremental assistant output.
- **Tool calls** — including bridged [tools](./tools), which surface as ordinary
  tool-call chunks the moment the in-sandbox agent invokes them.
- **Reasoning** — the agent's thinking, where the harness exposes it.
- **Run lifecycle** — run started / finished and related boundaries.

## Custom events

On top of the standard chunks, the sandbox and harness layers emit `CUSTOM`
events (`chunk.type === 'CUSTOM'`), each with a `name` and a `value`:

| Event `name` | Emitted by | When | `value` |
| --- | --- | --- | --- |
| `grok-build.session-id` | Grok Build adapter | once, when the in-sandbox session is created or resumed | the resumable harness session id |
| `claude-code.session-id` | Claude Code adapter | once, when the in-sandbox session is created or resumed | the resumable harness session id |
| `codex.session-id` | Codex adapter | once, when the session is created or resumed | the resumable harness session id |
| `opencode.session-id` | OpenCode adapter | once, when the session is created or resumed | the resumable harness session id |
| `file.changed` | harness adapter (e.g. Grok Build, Claude Code) | after the run completes | `{ path: string; diff: string }` — the whole working-tree `git diff` (`path` is always `'.'`, the tree root) |
| `sandbox.file` | the engine, automatically | per file create / change / delete while a sandbox is active | `{ type: 'create' \| 'change' \| 'delete'; path: string; timestamp: number }` |

The `*.session-id` event lets you resume a harness session on a follow-up run
(pass it back via the adapter's `modelOptions.sessionId`). `sandbox.file` is
emitted automatically whenever a sandbox is active and file watching is on —
no hooks required; see [Observability](./observability) to also handle these
server-side or to turn the watcher off.

> **Bridged tools emit their own events too.** A `chat()` tool that runs through
> the [tool bridge](./tools) can stream `CUSTOM` events back mid-execution. Code
> mode, for example, emits `code_mode:execution_started` and `code_mode:console`
> (plus `code_mode:external_call` / `…_result` / `…_error`) so you can show its
> progress live. Read them with the same pattern below.

## Reading CUSTOM events on the client

A `CUSTOM` chunk's `value` is of unknown shape, so narrow it with `typeof` / `in`
checks before reading its fields — never cast:

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

## Related

- [Observability](./observability) — server-side file-event hooks, debug logging, and the low-level watcher.
- [Tools](./tools) — bridged host tools that surface as tool-call (and CUSTOM) chunks.
- [Quick Start](./quick-start) — read the `file.changed` diff end to end.
