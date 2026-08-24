---
'@tanstack/ai-compaction': minor
---

Add `@tanstack/ai-compaction` — context-window compaction as a `chat()`
middleware. `withCompaction({ maxTokens, strategy })` runs a pluggable
`CompactionStrategy` before each model call, so compaction is incremental and
rolling. Three strategies ship built in: `evictOldest` (drop old messages, the
default), `summarizeOldest` (replace them with an LLM summary), and
`clearToolResults` (stub old tool output, keep the messages). Strategies
preserve tool-call/result pairing and never touch the system prompt.
