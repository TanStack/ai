---
'@tanstack/ai-compaction': minor
---

Count with real usage, compact on demand, and keep compaction in a session log.

- `countTokens: 'usage'` counts with the usage the provider reported for the last call, plus an estimate of the newer messages.
- When a model call fails with `CONTEXT_OVERFLOW_CODE`, `withCompaction` compacts and calls the model again in the same run, once per model call.
- `compactNext(threadId)` compacts at the next model call. `auto: false` turns off compaction at `maxTokens` and keeps `compactNext`, the overflow retry, and the overflow check.
- `durable: true` writes a `tanstack.compaction` record through `LogRecordsCapability` when the host provides it. Fold the record into the messages with `projectCompaction`.
- With `countTokens: 'usage'` and `durable: true`, a run checks once more after its last model call. When the usage passed `maxTokens` or `contextWindow`, compaction runs right away. `contextWindow` also counts with `auto: false`.
- `compaction:ended` and `onCompact` report `reason`, the summary `usage`, and an `error`. `continueOnError` sends the full messages when the strategy fails.
- `summarizeOldest({ cut: 'turn' })` gives the start of a cut turn its own summary. `conversationSummarizer` writes a structured summary, updates the older summary, and takes a `details` hook. The summary message is now wrapped in an `<untrusted-conversation-summary>` tag, so a later compaction can find and update it.
