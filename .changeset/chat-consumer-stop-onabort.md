---
'@tanstack/ai': patch
---

A `chat()` consumer that stops iterating (`break` or `return()`) now runs the middleware `onAbort` hook, so every run gets exactly one terminal hook.
