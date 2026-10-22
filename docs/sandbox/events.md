---
title: Events
id: events
order: 9
description: "Everything a harness agent does inside a sandbox (text, tool calls, reasoning, session ids, and file edits) streams back as AG-UI chunks plus named CUSTOM events. Read them, show them, and choose what to store."
---

Sandbox events stream the agent text, tool calls, and file edits to the UI while the run is in progress.

Everything a harness does in a sandbox comes back on the `chat()` stream. You get the normal AG-UI chunks, plus `CUSTOM` events with a `name` for sandbox-specific things such as file edits.

## Read the events

This sample prints the agent's text and every file it touches:

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
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const repoSandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: githubRepo({ repo: 'owner/app' }),
    setup: [GROK_CLI_INSTALL_COMMAND],
    secrets: createSecrets({ XAI_API_KEY: process.env.XAI_API_KEY ?? '' }),
  }),
  fileEvents: { diff: true }, // also send sandbox.file.diff for each change
})

const stream = chat({
  threadId: 'thread-1',
  adapter: grokBuildText('grok-build'),
  messages: [{ role: 'user', content: 'Add a README section on testing.' }],
  middleware: [withSandbox(repoSandbox)],
})

for await (const chunk of stream) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    process.stdout.write(chunk.delta)
  } else if (chunk.type === 'CUSTOM' && chunk.name === 'sandbox.file') {
    console.log(chunk.value.type, chunk.value.path)
  } else if (chunk.type === 'CUSTOM' && chunk.name === 'sandbox.file.diff') {
    console.log(chunk.value.path, chunk.value.diff)
  } else if (chunk.type === 'CUSTOM' && chunk.name === 'file.changed') {
    console.log(chunk.value.diff)
  }
}
```

You see `create`, `change`, and `delete` lines while the agent works. When the run ends, you see the full `git diff`.

Compare `chunk.name` to a literal string, and TypeScript types `chunk.value` for you. You need no helper and no cast.

## The stream

A harness run sends the standard AG-UI `StreamChunk`s:

- **Text**: the assistant output, piece by piece.
- **Tool calls**, also bridged [tools](./tools). They show up as normal tool-call chunks when the agent calls them.
- **Reasoning**: the agent's thinking, when the harness exposes it.
- **Run lifecycle**: run started, run finished, and other boundaries.

This page is about the stream that the client reads. To run server-side callbacks on file changes, or to log sandbox internals, see [Observability](./observability).

## Custom events

On top of the standard chunks, the sandbox and harness layers send `CUSTOM` events (`chunk.type === 'CUSTOM'`). Each one has a `name` and a `value`:

| Event `name` | Sent by | When | `value` |
| --- | --- | --- | --- |
| `grok-build.session-id` | Grok Build adapter | Once, when the session is created or resumed | `{ sessionId: string }` |
| `claude-code.session-id` | Claude Code adapter | Once, when the session is created or resumed | `{ sessionId: string }` |
| `codex.session-id` | Codex adapter | Once, when the session is created or resumed | `{ sessionId: string }` |
| `opencode.session-id` | OpenCode adapter | Once, when the session is created or resumed | `{ sessionId: string }` |
| `file.changed` | Harness adapter (for example Grok Build, Claude Code) | After the run completes | `{ path: string; diff: string }`: the whole working-tree `git diff`. `path` is always `'.'`, the tree root. |
| `sandbox.file` | The engine, automatically | For each file create, change, or delete while a sandbox is active | `{ type: 'create' \| 'change' \| 'delete'; path: string; timestamp: number }` |
| `sandbox.file.diff` | The engine, with `fileEvents: { diff: true }` | For each file create, change, or delete, after the matching `sandbox.file` | `{ path: string; diff: string }`: a unified patch of that one file against the git baseline of the session |

- **`*.session-id`**: pass the id back with the adapter's `modelOptions.sessionId` to resume the harness session on a later run.
- **`sandbox.file`**: sent whenever a sandbox is active and file watching is on. You need no hooks.
- **`sandbox.file.diff`**: off by default, because a diff on every change has a cost. Turn it on with `fileEvents: { diff: true }` on `defineSandbox` when the client must show the change, not only know that it happened.

To handle file changes on the server with hooks, or to turn the watcher off, see [Observability](./observability). Hooks get the same diff, plus `before()` and `after()`.

For the full typed event list and the `ChatStream` type, see [Custom Events Reference](../protocol/custom-events).

## What gets stored

Your user opens a thread the next morning and wants to see the commands the agent ran and their results. The stream on this page is live output. The transcript your app keeps is a different thing.

Add [chat persistence](../persistence/chat-persistence) next to `withSandbox`. A finished run then leaves this in the message store:

| The harness produced | In the store |
| --- | --- |
| Text | Yes, as the assistant message. |
| Tool calls (name and arguments) | Yes, as `toolCalls` on an assistant message. |
| Tool results | Yes, as a `role: 'tool'` message. |
| Reasoning | No. |
| `CUSTOM` events (file events, code-mode console, session ids) | No. |

So when the user opens the thread again, on any device, the tool cards come back with their results.

`CUSTOM` events are not messages. Anything your UI builds from them (a file list, a console panel) lasts only for that visit. If you want it back later, store that state yourself.

Two limits:

- All of the harness text arrives as one final assistant message. A restored thread shows the tool cards in the order they ran, then the full text.
- A stored result is the string that the harness reported. Opening a thread again never runs a tool again.

## Advanced

### Bridged tools send their own events

A `chat()` tool that runs through the [tool bridge](./tools) can stream `CUSTOM` events during its run. Code mode, for example, sends:

- `code_mode:execution_started`
- `code_mode:console`
- `code_mode:external_call`, `code_mode:external_result`, and `code_mode:external_error`

Read them with the same literal-name pattern to show progress live.

### Session-id events with any adapter

Each adapter sends its own name (`claude-code.session-id`, `codex.session-id`, `grok-build.session-id`, `opencode.session-id`). So the type of the name is the template literal `` `${string}.session-id` ``, not one string.

If you know the adapter, compare the exact name. It types `chunk.value` like any other event:

```ts
import { resumeSession } from './session'
import { stream } from './my-run'

for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'claude-code.session-id') {
    resumeSession(chunk.value.sessionId) // typed as string
  }
}
```

`chunk.name.endsWith('.session-id')` does **not** narrow the type. It is a plain boolean, so `chunk.value` stays untyped, even though the check is correct at runtime.

To handle the session id of any adapter without a list of names, write a small type predicate:

```ts
import type { KnownCustomEvent, SessionIdEvent } from '@tanstack/ai'
import { resumeSession } from './session'
import { stream } from './my-run'

function isSessionIdEvent(chunk: KnownCustomEvent): chunk is SessionIdEvent {
  return chunk.name.endsWith('.session-id')
}

for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && isSessionIdEvent(chunk)) {
    resumeSession(chunk.value.sessionId) // typed as string
  }
}
```

TanStack AI does not ship this guard. You write it yourself, only for this "any adapter" case.

### Trim what you keep

To decide if you store a transcript at all, see [Build a Sandbox Adapter](../persistence/build-a-sandbox-adapter). This section is for when you store one and want it smaller.

The tool output of one run can be hundreds of kilobytes, and results reach your store whole. Your `MessageStore` decides what to keep.

To keep the cards but limit the size, cap each result:

```ts
import type { ModelMessage } from '@tanstack/ai'
import type { MessageStore } from '@tanstack/ai-persistence'
import { db } from './db'

const MAX_RESULT = 8_000

const store: MessageStore = {
  async saveThread(threadId, messages) {
    const capped = messages.map((message: ModelMessage) =>
      message.role === 'tool' && typeof message.content === 'string'
        ? { ...message, content: message.content.slice(0, MAX_RESULT) }
        : message,
    )
    await db.saveThread(threadId, capped)
  },
  loadThread: (threadId) => db.loadThread(threadId),
}
```

To drop the history, remove each result together with its call. A result without its call is worse than both options, because providers reject it.

`isSandboxToolCall` tells you which calls the harness ran inside the sandbox, so you do not need to know how they are marked. It also reads a rendered `tool-call` part, which helps when you filter a client-side view.

```ts
import { isSandboxToolCall } from '@tanstack/ai-sandbox'
import type { ModelMessage } from '@tanstack/ai'
import type { MessageStore } from '@tanstack/ai-persistence'
import { db } from './db'

const store: MessageStore = {
  async saveThread(threadId, messages) {
    const dropped = new Set<string>()
    const kept: Array<ModelMessage> = []
    for (const message of messages) {
      const calls = message.toolCalls
      if (calls && calls.length > 0 && calls.every(isSandboxToolCall)) {
        for (const call of calls) dropped.add(call.id)
        continue
      }
      if (
        message.role === 'tool' &&
        message.toolCallId !== undefined &&
        dropped.has(message.toolCallId)
      ) {
        continue
      }
      kept.push(message)
    }
    await db.saveThread(threadId, kept)
  },
  loadThread: (threadId) => db.loadThread(threadId),
}
```

Dropping them is safe. They are display history, and nothing resumes from them. The next request to the model never carries them either, because they name tools that the provider never got.
