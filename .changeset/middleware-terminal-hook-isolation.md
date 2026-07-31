---
'@tanstack/ai': patch
---

A throwing middleware terminal hook no longer cancels every other middleware's teardown.

`onFinish`, `onAbort`, and `onError` were fanned out in an unguarded `for` loop, so the first hook to throw skipped every middleware ordered after it. These are the hooks that release per-middleware resources — `withSandbox`'s `onAbort` detaches or destroys the sandbox and stamps `detachedSince`; `withPersistence`'s `onAbort` records the run's status through the store — so one transient store error leaked a sandbox permanently, for every middleware behind it in the chain. `runOnAbort` is additionally awaited from `chat()`'s `finally`, where a throw also replaced the original abort reason with the hook's error.

All three fan-outs now give **every** middleware its turn: a throw is captured, logged on the `errors` channel (never invisible), and the loop continues. Instrumentation only reports the hooks that actually completed.

**Isolation does not mean silence, and the three hooks differ in who reports:**

- **`onFinish` reports.** It is the only terminal fan-out on the success path, and it is where `withPersistence`'s `onFinish` saves the assistant turn. The collected failures are therefore rethrown **after** the loop: a single failure as-is (so the store's own message, `cause` and `code` reach the caller and the wire), several as an `AggregateError`. Previously they were swallowed, and a failed `messages.append` left a `completed` run record for a turn that never reached storage with a middleware log line as the only trace anywhere.

  This fan-out is awaited **after** the run's `RUN_FINISHED` has already been streamed, so the rethrow can only append to what the consumer saw, never retract it — and what it achieves differs per transport:

  - **Without durability**, the throw escapes mid-response and the SSE / HTTP-stream encoder emits a **trailing `RUN_ERROR`** carrying the store's own message and `code`. `ai-client` surfaces that as an error status, so the user is no longer told the turn was saved when it was not.
  - **With durability**, the throw reaches the **durability sink**, which records it server-side and leaves the already-forwarded `RUN_FINISHED` standing rather than appending a contradictory second terminal. That is intended: the _save_ failed, not the run — the client did receive the complete stream. The improvement is that the sink observes the failure at all; before, it never did.

- **`onAbort` and `onError` swallow, after logging.** Both run once the outcome is already decided and already being reported — the abort reason, or the run's real error, which `chat()` rethrows the moment the fan-out returns. A propagated hook throw there could only _displace_ that outcome with a teardown artifact, so it stops at the log.

**`onChunk` and `onConfig` are deliberately NOT guarded.** They are transform hooks in the middle of the data path: swallowing a throw there would forward a chunk or a config the middleware had decided to reject, silently producing wrong output rather than a failed run. A throw from either still fails the stream, which is the correct behavior — so a middleware doing anything fallible inside `onChunk` or `onConfig` still has to handle its own errors.
