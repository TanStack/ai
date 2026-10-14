---
'@tanstack/ai-compaction': minor
---

Prepare a compaction summary in the background with `withCompaction({ background: { atTokens } })`.

- When the count at a model call is over `atTokens` and not over `maxTokens`, the strategy runs on a copy of the messages. The model call does not wait for it.
- The result waits in the metadata store (namespace `@tanstack/ai-compaction:background`), or in memory without one. It applies at the first model call of the next run: as a `tanstack.compaction` record on a durable host, or as the checkpoint.
- A model call over `maxTokens` while the summary runs waits for it and applies it. It compacts inline only when the list is still over `maxTokens`.
- A result whose kept message is gone, because a newer compaction cut further, is dropped. `compaction:ended` and `onCompact` report it with `stale: true`. A failed summary is reported with `error` and applies nothing.
- `CompactionReason` has a new value, `'background'`. Setup throws when `atTokens` is not below `maxTokens`.
