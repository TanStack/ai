---
'@tanstack/ai-compaction': patch
---

`summarizeOldest` now fails the compaction when the summarizer returns an empty or whitespace-only summary. Before, it replaced the old messages with an empty summary and saved that result in the checkpoint, so the history was lost. Now the strategy throws an error, the history stays, and no checkpoint is written.
