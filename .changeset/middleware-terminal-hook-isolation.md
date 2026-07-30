---
'@tanstack/ai': patch
---

A throwing middleware terminal hook no longer cancels every other middleware's teardown.

`onFinish`, `onAbort`, and `onError` were fanned out in an unguarded `for` loop, so the first hook to throw skipped every middleware ordered after it. These are the hooks that release per-middleware resources — `withSandbox`'s `onAbort` detaches or destroys the sandbox and stamps `detachedSince`; `withPersistence`'s `onAbort` records the run's status through the store — so one transient store error leaked a sandbox permanently, for every middleware behind it in the chain. `runOnAbort` is additionally awaited from `chat()`'s `finally`, where a throw also replaced the original abort reason with the hook's error.

All three terminal fan-outs are now guarded **per middleware**: a throw is logged on the `errors` channel (never swallowed silently) and the loop continues, and instrumentation only reports the hooks that actually completed. This is the same rule `@tanstack/ai-sandbox`'s `dispatchDefinitionHooks` already applied to definition hooks — one bad hook cannot break the run.

**`onChunk` and `onConfig` are deliberately NOT guarded.** They are transform hooks in the middle of the data path: swallowing a throw there would forward a chunk or a config the middleware had decided to reject, silently producing wrong output rather than a failed run. A throw from either still fails the stream, which is the correct behavior — so a middleware doing anything fallible inside `onChunk` or `onConfig` still has to handle its own errors.
