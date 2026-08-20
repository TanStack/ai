---
'@tanstack/ai': patch
'@tanstack/ai-persistence': patch
---

Route adapter-emitted `RUN_ERROR` events through middleware `onError` hooks and preserve provider error codes in persisted run failures.
