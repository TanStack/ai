---
'@tanstack/ai-sandbox-local-process': patch
---

Fix local-process spawn handles hanging when the child exits before `wait()` is called.
