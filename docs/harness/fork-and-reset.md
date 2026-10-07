---
title: Fork and reset a thread
id: harness-fork-and-reset
order: 4
description: "Copy a thread into a new one up to a message, to try another path. Or reset the model context with a handoff note, and keep the whole history."
keywords:
  - tanstack ai
  - harness
  - fork
  - branch
  - reset
  - handoff
---

A user wants to try another answer from an earlier message, but keep the current path too. Another user has a long thread, and the old context confuses the model. A fork copies a thread into a new thread, up to a message. A reset starts a fresh model context with a short note, and the transcript keeps every message.

## Fork a thread at a message

`host.fork` copies a thread into a new thread and returns the open session of the new thread:

```ts group=harness-fork-and-reset
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'

export const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
})

const host = createHarnessHost({ persistence: memoryPersistence() })

export async function branch(threadId: string, messageId: string) {
  const fork = await host.fork(assistant, {
    threadId,
    newThreadId: `${threadId}-branch-${messageId}`,
    at: messageId,
  })
  return fork.threadId
}
```

`at` is the id of the last message to copy. The message ids stay the same, so `at` points at the same message in both threads.

- Without `at`, the fork copies the whole transcript.
- With `at: null`, the fork copies no messages. It still copies the settings and the plugin config, so the new thread starts empty with the same setup.

The fork copies:

- The transcript, up to and including the message `at`.
- The [stored settings](./thread-settings) of the thread, and the values that `setConfig` stored for its plugins.
- The media that the copied messages use. The copies get new ids.

The fork does not copy plugin state, pending interrupts, queued inputs, running work, or [usage totals](./usage). If `newThreadId` already has messages, `host.fork` throws. It also throws for an `at` that the thread does not have.

If a thread waits for an approval, fork it at a message before the tool call. A fork of the whole transcript copies the tool call, but the fork has no interrupt to answer it.

## Fork before or through a message

A user edits an earlier message and sends it again. The fork must stop before that message. `host.sessions.fork` takes the cut as `{ before: id }` or `{ through: id }`, and it writes the new thread into the [session index](./sessions):

```ts group=harness-fork-and-reset
export async function editAndResend(threadId: string, messageId: string, text: string) {
  const entry = await host.sessions.fork(assistant, threadId, { before: messageId })
  const fork = await host.open(assistant, { threadId: entry.threadId })
  await fork.prompt(text)
  return entry.threadId
}
```

- `{ before: id }` copies the messages before `id`. Before the first message, the fork has no messages, but it keeps the settings.
- `{ through: id }` copies the messages up to and including `id`, as `at` does.
- The host picks the new thread id. The new index entry has the title of the old one plus ` (fork)`, and the same owner.
- `host.sessions.fork` calls `host.fork`, so it copies the same things as `host.fork`.

## Fork from the client

The handler forks with `POST sessions` and the body `{ op: 'fork', threadId, before }` or `{ op: 'fork', threadId, through }`. The client calls it with `forkSession`, then opens the new thread:

```ts group=harness-fork-and-reset-client
import { createHarnessClient } from '@tanstack/ai-harness/client'
import type { assistant } from './harness'

const client = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: 'support-1',
})
const entry = await client.forkSession('support-1', { through: 'msg-7' })

const branch = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: entry.threadId,
})
await branch.prompt('Try a shorter answer.')
```

The route needs `stores.sessions` on the host. A user can fork only a thread that the user owns in the index. For another thread, the handler answers `404`. For a thread that another harness of the host runs, it answers `409` with `{ error: 'other_harness' }`.

## Reset with a handoff note

`session.reset(note)` starts a fresh model context. From the next turn, the model sees only the note and what comes after the reset:

```ts group=harness-fork-and-reset
export async function startFresh(threadId: string) {
  const session = await host.open(assistant, { threadId })
  return session.reset(
    'Summary: the user moves the billing service to the new region. The DNS change is done. The database move is next.',
  )
}
```

A client sends the same input:

```ts group=harness-fork-and-reset-client
const support = createHarnessClient<typeof assistant>({
  url: '/api/harness',
  threadId: 'support-1',
})
await support.reset('Summary: the refund is approved. Only the email to the user is left.')
```

What the reset does:

- The note reaches the model as a user message, as you wrote it. Write it as a summary or a handoff. Without a note, the model sees only what comes after the reset.
- `transcript()` keeps every message. The reset adds a marker message with `metadata.harness.reset`, so a UI can draw a line there. The [session view](./custom-ui) shows it as an `info` notice.
- If a turn runs, the reset waits. It applies when that turn ends, before the next queued turn.
- While the thread waits for interrupts, the reset is refused with `pending_interrupts`. Answer the interrupts first.
- It is an input, so it runs once per `inputId`. On a durable host, the reset stays after a restart, and [compaction](./compaction) after a reset sees only the new context.

## What you have now

- A branch of a thread at any message, with its settings and media.
- A fork from the browser, before or through a message.
- A fresh model context with a handoff note, and the whole history in the transcript.
- A marker in the transcript that your UI can show as a line.
