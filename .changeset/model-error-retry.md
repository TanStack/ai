---
'@tanstack/ai': minor
---

Add the `onModelError` middleware hook and `ctx.retry()`. When a model call fails before it streams output, `onModelError` gets the `RUN_ERROR`. Call `ctx.retry()` there to drop the failed call, run `onConfig` again, and call the model again. A model call retries at most 2 times this way. `ctx.retry()` throws in any other hook.
