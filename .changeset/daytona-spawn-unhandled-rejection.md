---
'@tanstack/ai-sandbox-daytona': patch
---

A background process from `spawn()` no longer crashes Node with an unhandled rejection when its status poll fails, for example after `destroy()`. `wait()` still rejects with the error.
