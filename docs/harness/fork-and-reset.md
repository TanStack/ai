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
- The [stored settings](./thread-settings) of the thread, and the values that `setPluginSetting` stored for its plugins.
- The media that the copied messages use. The copies get new ids.

The fork does not copy plugin state, pending interrupts, queued inputs, running work, or [usage totals](./usage). If `newThreadId` already has messages, `host.fork` throws. It also throws for an `at` that the thread does not have.

A fork stays in its harness. If the index entry of the thread names another harness, `host.fork` throws. To move a conversation to another harness, use [`host.transfer`](./handoffs#5-move-a-conversation-to-another-harness).

On a host with [`access`](./access), pass `user` too. The user needs the `fork` action on the old thread, and owns the new thread.

If a thread waits for an approval, fork it at a message before the tool call. A fork of the whole transcript copies the tool call, but the fork has no interrupt to answer it.

## Fork before or through a message

A user edits an earlier message and sends it again. The fork must stop before that message. `host.sessions.fork` takes the cut as `at: { before: id }` or `at: { through: id }`, and it writes the new thread into the [session index](./sessions):

```ts group=harness-fork-and-reset
export async function editAndResend(threadId: string, messageId: string, text: string) {
  const entry = await host.sessions.fork({
    harness: assistant,
    threadId,
    at: { before: messageId },
  })
  const fork = await host.open(assistant, { threadId: entry.threadId })
  await fork.send(text)
  return entry.threadId
}
```

- `{ before: id }` copies the messages before `id`. Before the first message, the fork has no messages, but it keeps the settings.
- `{ through: id }` copies the messages up to and including `id`, as `at` does.
- The host picks the new thread id. The new index entry has the title of the old one plus ` (fork)`.
- `members` picks who can use the fork. `'self'`: only the user who forks, as the owner. `'all'`: the user who forks is the owner, and the other members keep their roles. See [Fork a shared thread](./shared-threads#6-fork-a-shared-thread).
- Without host `access` and without `members`, the fork keeps the owner and the members of the old thread.
- `host.sessions.fork` calls `host.fork`, so it copies the same things as `host.fork`.

## Reset with a handoff note

`session.reset({ note })` starts a fresh model context. From the next turn, the model sees only the note and what comes after the reset:

```ts group=harness-fork-and-reset
export async function startFresh(threadId: string) {
  const session = await host.open(assistant, { threadId })
  return session.reset({
    note: 'Summary: the user moves the billing service to the new region. The DNS change is done. The database move is next.',
  })
}
```

What the reset does:

- The note reaches the model as a user message, as you wrote it. Write it as a summary or a handoff. Without a note, the model sees only what comes after the reset.
- `transcript()` keeps every message. The reset adds a marker message with `metadata.harness.reset`, so a UI can draw a line there. The session also sends a `harness.reset` event. The [session view](./custom-ui) shows it as an `info` notice.
- If a turn runs, the reset waits. It applies when that turn ends, before the next queued turn.
- While the thread waits for interrupts, the reset is refused with `pending_interrupts`. Answer the interrupts first.
- It is an input, so it runs once per `inputId`. On a durable host, the reset stays after a restart, and [compaction](./compaction) after a reset sees only the new context.

## What you have now

- A branch of a thread at any message, with its settings and media.
- A fork before or through a message, in the session index.
- A fresh model context with a handoff note, and the whole history in the transcript.
- A marker in the transcript that your UI can show as a line.
