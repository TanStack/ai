---
'@tanstack/ai': patch
---

A throwing middleware terminal hook no longer cancels every other middleware's teardown.

`onFinish`, `onAbort`, and `onError` were fanned out in an unguarded `for` loop, so the first hook to throw skipped every middleware ordered after it. These are the hooks that release per-middleware resources — `withSandbox`'s `onAbort` detaches or destroys the sandbox and stamps `detachedSince`; `withPersistence`'s `onAbort` records the run's status through the store — so one transient store error leaked a sandbox permanently, for every middleware behind it in the chain. `runOnAbort` is additionally awaited from `chat()`'s `finally`, where a throw also replaced the original abort reason with the hook's error.

All three fan-outs now give **every** middleware its turn: a throw is captured, logged on the `errors` channel (never invisible), and the loop continues. Instrumentation only reports the hooks that actually completed.

**Isolation does not mean silence, and the three hooks differ in who reports:**

- **`onFinish` reports.** It is the only terminal fan-out on the success path — `chat()` awaits it inside its `try`, before the run is declared successful — and it is where `withPersistence`'s `onFinish` saves the assistant turn. The collected failures are therefore rethrown **after** the loop: a single failure as-is (so the store's own message, `cause` and `code` reach the caller and the wire), several as an `AggregateError`. Swallowing them would report `RUN_FINISHED` with `outcome: success` and a `completed` run record for a turn that never reached storage, leaving the client to send a history the server has no record of.
- **`onAbort` and `onError` swallow, after logging.** Both run once the outcome is already decided and already being reported — the abort reason, or the run's real error, which `chat()` rethrows the moment the fan-out returns. A propagated hook throw there could only *displace* that outcome with a teardown artifact, so it stops at the log.

**`onChunk` and `onConfig` are deliberately NOT guarded.** They are transform hooks in the middle of the data path: swallowing a throw there would forward a chunk or a config the middleware had decided to reject, silently producing wrong output rather than a failed run. A throw from either still fails the stream, which is the correct behavior — so a middleware doing anything fallible inside `onChunk` or `onConfig` still has to handle its own errors.
