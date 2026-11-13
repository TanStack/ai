---
'@tanstack/ai': patch
---

Treat a failed `onAfterToolCall` middleware hook as a chat run error instead of recording a second, contradictory tool result.

Deliver and persist that error for durable streams even after an earlier tool iteration emitted `RUN_FINISHED`.
