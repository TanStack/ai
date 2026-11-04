---
'@tanstack/ai-sandbox-vercel': patch
---

`create` now stops a sandbox that comes after the signal aborted. Before, that sandbox kept running with no owner.
