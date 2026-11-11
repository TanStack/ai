---
'@tanstack/ai-effect': patch
---

Interrupting a `chat` Stream, with `Stream.take` or `Fiber.interrupt`, now runs the middleware `onAbort` hook, and the interrupt completes after the run's teardown.
