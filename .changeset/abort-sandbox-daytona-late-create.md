---
'@tanstack/ai-sandbox-daytona': patch
---

`create` and `restoreSnapshot` now delete a sandbox that the SDK makes after the signal aborted. Before, that sandbox kept running with no owner.
