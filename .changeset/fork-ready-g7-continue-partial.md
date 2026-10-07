---
'@tanstack/ai-harness': minor
---

`turn.onModelError` can answer `'continue'`. The partial text of the failed call stays in the turn result and in the transcript. The next model call gets that text and a note to continue it. `ModelErrorContext` has a new `partial` flag. `retryTransientErrors()` answers `'continue'` when the failed call streamed text, and `'retry'` otherwise. The `harness.turn.retry` event has a new `continued` field.
