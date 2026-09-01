---
'@tanstack/ai-sandbox-local-process': patch
---

fix: stop an uncaught EPIPE when a write goes to a child that closed its stdin
