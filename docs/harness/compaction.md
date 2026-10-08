---
title: Compact a harness session
id: harness-compaction
order: 4
description: "Keep a long harness session under the context limit. The compaction goes into the session log, so a session that opens again sees the same context."
keywords:
  - tanstack ai
  - harness
  - compaction
  - context window
  - projectCompaction
  - compactNext
  - session log
---

A harness session can run for days. Its transcript grows until a model call passes the context limit. [Compaction](../advanced/compaction) shrinks what the model sees. In a durable harness, the result must also survive a restart. A session that opens again must see the same context as before.

Set `durable: true`. Compaction then writes a `tanstack.compaction` record into the session log. The host folds that record into the messages with `projectCompaction`, live and when the session opens again.

## Add compaction to a harness

1. Create the compaction middleware with `durable: true`.
2. Add it to `middleware` in `defineHarness`.
3. Give the host `projectCompaction` in its `project` option.

```ts group=harness-compaction
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { openaiText } from '@tanstack/ai-openai'
import {
  conversationSummarizer,
  projectCompaction,
  summarizeOldest,
  withCompaction,
} from '@tanstack/ai-compaction'

const compaction = withCompaction({
  maxTokens: 180_000,
  contextWindow: 200_000,
  countTokens: 'usage',
  durable: true,
  strategy: summarizeOldest({
    cut: 'turn',
    keepRecentTokens: 8_000,
    summarize: conversationSummarizer({ adapter: openaiText('gpt-6.1-sol') }),
  }),
})

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-6.1-sol'),
  middleware: [compaction],
})

const { runs, metadata } = memoryPersistence().stores
const host = createHarnessHost({
  persistence: { stores: { log: memoryLogStore(), runs, metadata } },
  project: { version: 'v1', record: projectCompaction },
})
```

- Compaction runs before a model call when the count passes `maxTokens`. If the usage of the last model call of a turn passed `maxTokens` or `contextWindow`, compaction also runs right after that call. This check needs `countTokens: 'usage'`.
- The log only grows, so the original messages stay in the store. The fold that the model gets starts with the summary.
- A host without a log has no place for the record. Compaction then keeps its result in the `metadata` store, the same as in a plain `chat()` call. It also skips the check after the turn.

## Prepare the summary in the background

A summary call takes time. When compaction runs at `maxTokens`, the user waits for that call before the model answers. Set `background` to prepare the summary earlier, while the session goes on:

```ts group=harness-compaction
const earlyCompaction = withCompaction({
  maxTokens: 180_000,
  contextWindow: 200_000,
  countTokens: 'usage',
  durable: true,
  background: { atTokens: 150_000 },
  strategy: summarizeOldest({
    cut: 'turn',
    keepRecentTokens: 8_000,
    summarize: conversationSummarizer({ adapter: openaiText('gpt-6.1-sol') }),
  }),
})
```

- `atTokens` must be below `maxTokens`. If it is not, `withCompaction` throws.
- When the count at a model call passes `atTokens`, the summary starts beside the turn. The turn does not wait for it.
- The summary applies at the first model call of the next run, never in the middle of a run. On a durable host, it goes into the log as a `tanstack.compaction` record with `reason: 'background'`.
- A model call over `maxTokens` while the summary runs waits for it and applies it. It compacts inline only when the messages are still over `maxTokens`.
- If you cancel the run during that wait, the wait stops. The summary continues and applies at the next run.

Sometimes a summary does not apply:

- A newer compaction cut past the message that the summary keeps. The summary is dropped. `onCompact` and `compaction:ended` report it with `stale: true`.
- The summary call failed. Nothing applies. `onCompact` and `compaction:ended` report it with `error`. The next model call past `atTokens` starts a new summary.

## Fold your own records too

If your host already folds records of its own, call `projectCompaction` first:

```ts group=harness-compaction
import type { ProjectOptions } from '@tanstack/ai-harness'

const project: ProjectOptions = {
  version: 'v2',
  record: (input) => {
    const compacted = projectCompaction(input)
    if (compacted) return compacted
    const { record, messages } = input
    if (record.type === 'app.signal' && typeof record.text === 'string') {
      return [...messages, { role: 'user', content: record.text }]
    }
    return undefined
  },
}
```

Change `version` when you change the function. A fold checkpoint with another version is ignored.

## Retry after a context overflow

A model call can still fail with a context overflow. Call `compactNext` in `turn.onModelError`, then return `'retry'`. The retried call compacts first and writes the record.

```ts group=harness-compaction
import { isContextOverflow } from '@tanstack/ai'

const recovering = defineHarness({
  name: 'acme/recovering',
  adapter: openaiText('gpt-6.1-sol'),
  middleware: [compaction],
  turn: {
    onModelError: ({ session, error, retries }) => {
      if (retries > 0 || !isContextOverflow({ error: error.message })) {
        return undefined
      }
      compaction.compactNext(session.threadId)
      return 'retry'
    },
  },
})
```

- `retries > 0` stops after one retry. A second overflow fails the turn with its error.
- `compactNext` also works with `auto: false`. With `auto: false`, compaction runs only for this recovery and for the `contextWindow` check.

## What you have now

- A session that compacts before it passes the context limit, counted with the real usage of each call.
- The same context after a restart, because the compaction is in the log.
- With `background`, a summary that is ready before the session reaches `maxTokens`.
- One retry after an overflow, with a compaction first.
