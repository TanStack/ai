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
| `sandbox.file.diff` | the engine, opt-in via `fileEvents: { diff: true }` | per file create / change / delete, after the matching `sandbox.file` | `{ path: string; diff: string }` — a unified patch of that one file vs the session's git baseline |

The `*.session-id` event lets you resume a harness session on a follow-up run
(pass it back via the adapter's `modelOptions.sessionId`). `sandbox.file` is
emitted automatically whenever a sandbox is active and file watching is on —
no hooks required. `sandbox.file.diff` is off by default (computing a diff on
every change has a cost); turn it on with `fileEvents: { diff: true }` on
`defineSandbox` when the client needs to render the change itself, not just
know it happened:

```ts
import { defineSandbox } from "@tanstack/ai-sandbox";
import { dockerSandbox } from "@tanstack/ai-sandbox-docker";

const repoSandbox = defineSandbox({
  id: "repo-agent",
  provider: dockerSandbox({ image: "node:22" }),
  fileEvents: { diff: true }, // also emit sandbox.file.diff per change
});
```

See [Observability](./observability) to also handle file changes server-side
via hooks (which get the same diff, plus `before()`/`after()`), or to turn
the watcher off entirely.

> **Bridged tools emit their own events too.** A `chat()` tool that runs through
> the [tool bridge](./tools) can stream `CUSTOM` events back mid-execution. Code
> mode, for example, emits `code_mode:execution_started` and `code_mode:console`
> (plus `code_mode:external_call` / `…_result` / `…_error`) so you can show its
> progress live. Read them with the same pattern below.

## Reading CUSTOM events on the client

Every `CUSTOM` event TanStack AI itself emits — `sandbox.file`,
`sandbox.file.diff`, `file.changed`, the `*.session-id` events, and more — has
a fixed `name` and a concrete `value` shape, unified as `KnownCustomEvent`.
`chat()`'s return type narrows accordingly: check `chunk.type === 'CUSTOM'`
and then compare `chunk.name` to a literal string. No helper, no cast — the
plain `if` types `chunk.value` for you:

```ts
import { stream } from "./my-run";

for await (const chunk of stream) {
  if (chunk.type === "CUSTOM" && chunk.name === "sandbox.file") {
    console.log(chunk.value.type, chunk.value.path); // typed, no cast
  } else if (chunk.type === "CUSTOM" && chunk.name === "sandbox.file.diff") {
    console.log(chunk.value.path, chunk.value.diff); // typed, no cast
  } else if (chunk.type === "CUSTOM" && chunk.name === "file.changed") {
    console.log(chunk.value.diff); // typed, no cast
  }
}
```

### Session-id events aren't one literal name

`*.session-id` is emitted per-adapter (`claude-code.session-id`,
`codex.session-id`, `grok-build.session-id`, `opencode.session-id`), so its
type is the template-literal name `` `${string}.session-id` ``, not a single
string. If you know which adapter you're running, compare the exact literal
— it narrows `chunk.value` the same as any other event:

```ts
import { resumeSession } from "./session";
import { stream } from "./my-run";

for await (const chunk of stream) {
  if (chunk.type === "CUSTOM" && chunk.name === "claude-code.session-id") {
    resumeSession(chunk.value.sessionId); // typed as string, no cast
  }
}
```

> **`chunk.name.endsWith('.session-id')` does *not* narrow.** It's a plain
> boolean expression, not something TypeScript can attach to a type — so
> `chunk.value` stays whatever it was before the check (effectively
> `unknown`), even though the check happens to be correct at runtime. If you
> need to handle *any* adapter's session id without listing every adapter's
> literal name, write a small type predicate instead:
>
> ```ts
> import type { KnownCustomEvent, SessionIdEvent } from "@tanstack/ai";
> import { resumeSession } from "./session";
> import { stream } from "./my-run";
>
> function isSessionIdEvent(
>   chunk: KnownCustomEvent,
> ): chunk is SessionIdEvent {
>   return chunk.name.endsWith(".session-id");
> }
>
> for await (const chunk of stream) {
>   if (chunk.type === "CUSTOM" && isSessionIdEvent(chunk)) {
>     resumeSession(chunk.value.sessionId); // typed as string, no cast
>   }
> }
> ```
>
> This predicate is something you write yourself when you need it — TanStack
> AI doesn't ship a guard API. Plain literal-`name` narrowing (as above) is
> the primary, no-helper pattern; reach for a predicate only for this
> "any adapter" case.

See [Custom Events Reference](../protocol/custom-events) for the full typed
event taxonomy, the `ChatStream` type this narrowing relies on, and the
tradeoff for your own `emitCustomEvent` calls.

## What gets stored

Your user reopens a thread the next morning and wants what they saw before: the
commands the agent ran and what came back. The stream on this page is live output.
The transcript your app keeps is a different thing.

Wire [chat persistence](../persistence/chat-persistence) next to `withSandbox` and a
finished run leaves this in the message store:

| The harness produced | In the store |
| --- | --- |
| Text | Yes, as the assistant message. |
| Tool calls (name and arguments) | Yes, as `toolCalls` on an assistant message. |
| Tool results | Yes, as a `role: 'tool'` message. |
| Reasoning | No. |
| `CUSTOM` events (file events, code-mode console, session ids) | No. |

So reopening the thread rebuilds the tool cards with their results, on any device.

`CUSTOM` events are not messages, so anything your UI builds from them (a file list,
a console panel) lasts only for that visit. Keep that state yourself if you want it
back.

Two limits to know about:

- All of the harness's text arrives as one final assistant message. A restored thread
  reads as the tool cards in the order they ran, then the full text.
- A stored result is the string the harness reported. Reopening a thread never re-runs
  a tool.

### Trim what you keep

To decide whether to store a transcript at all, see
[Build a Sandbox Adapter](./build-a-sandbox-adapter). This section is the finer knob:
you are storing one, and you want it smaller.

One run's tool output can be hundreds of kilobytes, and results reach your store
whole. Your `MessageStore` decides what to keep. `isSandboxToolCall` tells you which
calls the harness ran inside the sandbox, so you never have to know how they are
marked. It reads a rendered `tool-call` part too, which is handy for filtering a
client-side view.

Capping each result keeps the cards and bounds the size:

```ts
import type { ModelMessage } from "@tanstack/ai";
import type { MessageStore } from "@tanstack/ai-persistence";
import { db } from "./db";

const MAX_RESULT = 8_000;

const store: MessageStore = {
  async saveThread(threadId, messages) {
    const capped = messages.map((message: ModelMessage) =>
      message.role === "tool" && typeof message.content === "string"
        ? { ...message, content: message.content.slice(0, MAX_RESULT) }
        : message,
    );
    await db.saveThread(threadId, capped);
  },
  loadThread: (threadId) => db.loadThread(threadId),
};
```

To drop the history instead, remove each result with its call. A result whose call is
missing is worse than either, because providers reject it.

```ts
import { isSandboxToolCall } from "@tanstack/ai-sandbox";
import type { ModelMessage } from "@tanstack/ai";
import type { MessageStore } from "@tanstack/ai-persistence";
import { db } from "./db";

const store: MessageStore = {
  async saveThread(threadId, messages) {
    const dropped = new Set<string>();
    const kept: Array<ModelMessage> = [];
    for (const message of messages) {
      const calls = message.toolCalls;
      if (calls && calls.length > 0 && calls.every(isSandboxToolCall)) {
        for (const call of calls) dropped.add(call.id);
        continue;
      }
      if (
        message.role === "tool" &&
        message.toolCallId !== undefined &&
        dropped.has(message.toolCallId)
      ) {
        continue;
      }
      kept.push(message);
    }
    await db.saveThread(threadId, kept);
  },
  loadThread: (threadId) => db.loadThread(threadId),
};
```

Dropping them is safe. They are display history, and nothing resumes from them: the
next turn's request to the model never carries them either, because they name tools
the provider was never given.

## Related

- [Observability](./observability) — server-side file-event hooks (with `before()`/`after()`/`diff()`), debug logging, and the low-level watcher.
- [Custom Events Reference](../protocol/custom-events) — the full `KnownCustomEvent` taxonomy and the `ChatStream` type.
- [Tools](./tools) — bridged host tools that surface as tool-call (and CUSTOM) chunks.
- [Quick Start](./quick-start) — read the `file.changed` diff end to end.
