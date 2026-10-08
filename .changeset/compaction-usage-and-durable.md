---
'@tanstack/ai-compaction': minor
---

Count with real usage, compact on demand, and keep compaction in a harness log.

- `countTokens: 'usage'` counts with the usage the provider reported for the last call, plus an estimate of the newer messages.
- `compactNext(threadId)` compacts at the next model call, for example after a context overflow. `auto: false` turns off compaction at `maxTokens` and keeps `compactNext` and the overflow check.
- With `countTokens: 'usage'` and `durable: true`, a harness turn checks once more after its last model call. When the usage passed `maxTokens` or `contextWindow`, compaction runs right away. `contextWindow` also counts with `auto: false`.
- `durable: true` writes a `tanstack.compaction` record into a harness session log. Set `project: { version, record: projectCompaction }` on the host.
- `compaction:ended` and `onCompact` report `reason`, the summary `usage`, and an `error`. `continueOnError` sends the full messages when the strategy fails.
- `summarizeOldest({ cut: 'turn' })` gives the start of a cut turn its own summary. `conversationSummarizer` writes a structured summary, updates the older summary, and takes a `details` hook.
