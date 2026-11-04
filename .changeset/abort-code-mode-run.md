---
'@tanstack/ai-code-mode': patch
---

An abort of the run now ends the `execute_typescript` program: a call that waits for an approval stops, and the isolate is disposed.
