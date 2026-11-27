---
'@tanstack/ai-harness': patch
---

A log that stops after a failed write now goes back with a wake of 30 seconds. Before, it was released with no wake, so no later `resumePending` or worker sweep listed it again.
