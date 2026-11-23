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
- **Activities**: the status of the sandbox start and the approval prompts, as activity rows. See [Show a pending state while the sandbox starts](#show-a-pending-state-while-the-sandbox-starts).

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
| `sandbox.starting` | `withSandbox` | Deprecated: read the [`sandbox.status`](#show-a-pending-state-while-the-sandbox-starts) row. Once, before the sandbox is created or resumed | `{ provider: string }` |
| `sandbox.created` | `withSandbox` | Deprecated: read the [`sandbox.status`](#show-a-pending-state-while-the-sandbox-starts) row. Once, when a new sandbox is ready | `{ sandboxId: string; provider: string }` |
| `sandbox.resumed` | `withSandbox` | Deprecated: read the [`sandbox.status`](#show-a-pending-state-while-the-sandbox-starts) row. Once, when an existing sandbox is ready again, also from a provider snapshot | `{ sandboxId: string; provider: string }` |

- **`*.session-id`**: pass the id back with the adapter's `modelOptions.sessionId` to resume the harness session on a later run.
- **`sandbox.file`**: sent whenever a sandbox is active and file watching is on. You need no hooks.
- **`sandbox.file.diff`**: off by default, because a diff on every change has a cost. Turn it on with `fileEvents: { diff: true }` on `defineSandbox` when the client must show the change, not only know that it happened.
- **`sandbox.starting`, `sandbox.created`, `sandbox.resumed`**: deprecated. `withSandbox` still sends them, before the model starts to stream. For a pending state, read the `sandbox.status` activity row, as in [the next section](#show-a-pending-state-while-the-sandbox-starts).

To handle file changes on the server with hooks, or to turn the watcher off, see [Observability](./observability). Hooks get the same diff, plus `before()` and `after()`.

For the full typed event list and the `ChatStream` type, see [Custom Events Reference](../protocol/custom-events).

## Show a pending state while the sandbox starts

`withSandbox` sends a `sandbox.status` activity row while the sandbox starts. Read that row from `messages` to show "Starting sandbox..." while the user waits.

A new sandbox can take many seconds to boot, and the model sends nothing during that time. Each run has one row, with the id `sandbox-<runId>`. Each update replaces the content of that row:

| `status` | When | Other fields |
| --- | --- | --- |
| `starting` | Before the sandbox is created or resumed | None |
| `ready` | The sandbox is ready | `sandboxId`, and `resumed` (`true` for a resumed sandbox) |
| `failed` | The start throws, or the user stops the run before the sandbox is ready | `error` |

Each row also has `provider`, the name of the sandbox provider.

1. On the server, add `withSandbox` to `chat()`. You add nothing else, because the row is on by default:

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
  })
  return toServerSentEventsResponse(stream)
}
```

`repoSandbox` is the `defineSandbox()` definition from [Read the events](#read-the-events).

2. On the client, find the activity part with the `activityType` `'sandbox.status'`. Show `starting` only while `isLoading` is `true`:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
  })

  return (
    <>
      <button onClick={() => sendMessage('Add a README section on testing.')}>
        Send
      </button>
      {messages.flatMap((message) =>
        message.parts.map((part) => {
          if (part.type !== 'activity' || part.activityType !== 'sandbox.status') {
            return null
          }
          const { status, resumed, error } = part.content
          if (status === 'failed') {
            return <p key={message.id}>The sandbox did not start: {error}</p>
          }
          if (status === 'ready') {
            return <p key={message.id}>{resumed ? 'Sandbox resumed.' : 'Sandbox ready.'}</p>
          }
          // A `starting` row is live only while the run streams.
          return isLoading ? <p key={message.id}>Starting sandbox...</p> : null
        }),
      )}
    </>
  )
}
```

Click Send. "Starting sandbox..." shows until the sandbox is ready. Then the card says "Sandbox ready.", and the agent starts to work.

`useChat` types the built-in activity types. After the `activityType` check, `part.content` has the fields from the table, with their types.

After a reload:

- **A saved row comes back.** Add [chat persistence](../persistence/chat-persistence) with an `activities` store, and `withPersistence` saves the row. `memoryPersistence()` has that store. See [AG-UI activity rows on reload](../persistence/chat-persistence-advanced#ag-ui-activity-rows-on-reload).
- **The store has the row during the boot.** `withPersistence` saves each change of the row at once, also before the run starts. A reload during the boot gets the `starting` row. A start that throws keeps its `failed` row.
- **A `starting` row is live only while `isLoading` is `true`.** A lost connection or a server crash during the boot can leave the row at `starting`. The snippet hides that row when no run streams.
- **A durable run shows the boot live after a reload.** Use [durable runs](./durable-runs). The client joins the run again, `isLoading` is `true` again, and the client gets the `ready` update.

Things to know:

- **Only `defineSandbox()` sends the row.** A sandbox definition that you build by hand sends no `sandbox.status` row.
- **A takeover sends no new row.** When another server [takes over](./takeover) a durable run, `withSandbox` sends no `sandbox.status`. The run log already has the rows from the first server.

### Move from the sandbox events

The `CUSTOM` events `sandbox.starting`, `sandbox.created`, and `sandbox.resumed` are deprecated. `withSandbox` still sends them, so an `onCustomEvent` handler for them keeps working. A later breaking release removes them.

Each event has a match in the row:

| Event | `sandbox.status` row |
| --- | --- |
| `sandbox.starting` | `status: 'starting'` |
| `sandbox.created` | `status: 'ready'`, `resumed: false` |
| `sandbox.resumed` | `status: 'ready'`, `resumed: true` |
| No event | `status: 'failed'`, with `error` |

The row also reports a failed start, and `withPersistence` can save it.

## Show an approval prompt

A harness adapter sends a `sandbox.approval` activity row when an action needs a decision from the user. Show the row with Allow and Deny buttons, and send the answer with `respondToSandboxApproval`.

Your sandbox [policy](./policy) marks these actions with `ask`. The Claude Code, OpenCode, and ACP adapters send the row. The ACP adapter needs `permissions: 'interactive'`.

1. The agent tries an `ask` action. The adapter denies it for this run and sends the row with `status: 'pending'`.
2. The user clicks Allow or Deny. `respondToSandboxApproval(approvalId, granted)` sets the row to `granted` or `denied`, then starts the next run. The request of that run carries the row.
3. The next run gets the decision. Right after `RUN_STARTED`, the adapter sets the same row to `granted` or `denied`. This run has no new user message, so the adapter sends the agent this text: `The user answered your approval requests. Continue the task.` When the agent tries the action again, the adapter allows or denies it with no new prompt.

The row id is `sandbox.approval:<approvalId>`. The `approvalId` stays the same across runs, so the next run updates the same row. The content has these fields:

- `approvalId`: the id of the action.
- `title`: a line to show, for example `Approve Bash: pnpm install`.
- `status`: `pending`, `granted`, or `denied`.
- `detail`: more data from the adapter, for example `provider`.

This component shows each prompt. A pending prompt gets Allow and Deny buttons:

```tsx
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Approvals() {
  const { messages, respondToSandboxApproval } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'support-chat',
  })

  return (
    <ul>
      {messages.flatMap((message) =>
        message.parts.map((part) => {
          if (part.type !== 'activity' || part.activityType !== 'sandbox.approval') {
            return null
          }
          const { approvalId, title, status } = part.content
          if (status !== 'pending') {
            return (
              <li key={message.id}>
                {title} ({status})
              </li>
            )
          }
          return (
            <li key={message.id}>
              {title}
              <button onClick={() => respondToSandboxApproval(approvalId, true)}>Allow</button>
              <button onClick={() => respondToSandboxApproval(approvalId, false)}>Deny</button>
            </li>
          )
        }),
      )}
    </ul>
  )
}
```

When the agent tries an `ask` action, the list shows `Approve Bash: pnpm install` with Allow and Deny buttons. Click Allow. The line changes to `Approve Bash: pnpm install (granted)`, and the next run starts.

An answer applies to one action. What counts as the same action depends on the adapter:

- **Claude Code**: the same command. For any other tool, for example `Write`, the same tool.
- **OpenCode**: the same permission type and title. The title of a `bash` request is its command.
- **ACP**: the same kind, title, and files of the tool call.

Things to know:

- **A pending prompt comes back after a reload.** Add [chat persistence](../persistence/chat-persistence) with an `activities` store. After a reload, the user can still answer the prompt.
- **The decision stays for the rest of the thread in two cases.** In both cases, the same action gets the same answer, with no new prompt:
  - On the server, `withPersistence` has an `activities` store. The server reads the saved row on each run.
  - The client still has the decided row. Each request carries it, also with `history: { pageSize }`.
- **A run in progress ends first.** If the user answers while a run streams, the next run starts after that run ends.
- **A pending interrupt holds the run.** If an [interrupt](../interrupts/overview) waits for an answer, `respondToSandboxApproval` only sets the row. It starts no run, and the next run carries the decision.
- **Each row takes one answer.** A second call for the same `approvalId` does nothing. A call with an unknown `approvalId` also does nothing.

The adapter also sends the `approval-requested` `CUSTOM` event, with the same `approvalId` and `title`. That event is deprecated. Read the row instead.

## What gets stored

Your user opens a thread the next morning and wants to see the commands the agent ran and their results. The stream on this page is live output. The transcript your app keeps is a different thing.

Add [chat persistence](../persistence/chat-persistence) next to `withSandbox`. A finished run then leaves this in your stores:

| The harness produced | In the store |
| --- | --- |
| Text | Yes, as the assistant message. |
| Tool calls (name and arguments) | Yes, as `toolCalls` on an assistant message. |
| Tool results | Yes, as a `role: 'tool'` message. |
| Activity rows (`sandbox.status`, `sandbox.approval`) | Yes, in the `activities` store, if you have one. |
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

A bridged tool can also call `context?.emitActivity?.(definition, id, content)` to send a typed activity row. Chat persistence can keep that row after a reload. See [Activities](../chat/activities).

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
