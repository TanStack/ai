---
'@tanstack/ai-harness': patch
---

Store a rejected input and its `harness.input.rejected` record in one log append. The rejected receipt resolves after that append is stored, and a crash no longer runs the input as pending work.
