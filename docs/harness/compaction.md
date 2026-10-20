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
3. Give the harness `projectCompaction` in its `durability.addRecordsToModelContext` option.

```ts group=harness-compaction
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
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
  durability: { addRecordsToModelContext: { version: 'v1', record: projectCompaction } },
})

const host = createHarnessHost({ persistence: memoryPersistence() })
```

- Compaction runs before a model call when the count passes `maxTokens`. If the usage of the last model call of a turn passed `maxTokens` or `contextWindow`, compaction also runs right after that call. This check needs `countTokens: 'usage'`.
- The log only grows, so the original messages stay in the store. The fold that the model gets starts with the summary.

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
- The summary applies at the first model call of the next run, never in the middle of a run. It goes into the log as a `tanstack.compaction` record with `reason: 'background'`.
- A model call over `maxTokens` while the summary runs waits for it and applies it. It compacts inline only when the messages are still over `maxTokens`.
- If you cancel the run during that wait, the wait stops. The summary continues and applies at the next run.

Sometimes a summary does not apply:

- A newer compaction cut past the message that the summary keeps. The summary is dropped. `onCompact` and `compaction:ended` report it with `stale: true`.
- The summary call failed. Nothing applies. `onCompact` and `compaction:ended` report it with `error`. The next model call past `atTokens` starts a new summary.

## Fold your own records too

If your harness already folds records of its own, call `projectCompaction` first:

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

Change `version` when you change the function. A log snapshot with another version is not used, so the host folds the log again from the first record.

## Retry after a context overflow

A model call can still fail because the context is too long. `withCompaction` handles it for you. When a call fails with `CONTEXT_OVERFLOW_CODE` (`'context_overflow'`), the middleware compacts and calls the model again, inside the `chat()` call of the turn. That compaction also writes its record to the log.

- It retries once per model call. This also works with `auto: false`.
- `turn.onModelError` sees the overflow only when the compacted call is still too long. Then `error.code` is `'context_overflow'`, and the turn fails unless your hook returns `'retry'`.
- To compact the next call yourself, for example before you switch the thread to a model with a smaller context window, call `compaction.compactNext(session.threadId)`.

For a strategy that always finds something to cut on the retry, see [Give the retry something to cut](../advanced/compaction#give-the-retry-something-to-cut).

## What you have now

- A session that compacts before it passes the context limit, counted with the real usage of each call.
- The same context after a restart, because the compaction is in the log.
- With `background`, a summary that is ready before the session reaches `maxTokens`.
- One retry after an overflow, with a compaction first, and no code of your own.
