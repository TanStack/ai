---
'@tanstack/ai-compaction': patch
---

Fail a compaction when the summarizer returns an empty or whitespace-only summary. Before, `summarizeOldest` replaced the history with an empty summary, so the history was lost. Now the compaction fails like any failed strategy: the history stays, `compaction:ended` (or `onCompact` after the turn) carries the error, and no durable record is written. With `continueOnError`, the run sends the history as it is.
