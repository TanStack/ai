---
'@tanstack/ai-client': minor
---

A generation stream that ends without a terminal chunk now settles to `error`
instead of wedging the client on `generating` forever.

`GenerationClient.processStream` / `VideoGenerationClient.processStream` only
settled the status on `RUN_FINISHED` or `RUN_ERROR`. A `for await` loop over a
stream that simply _ends_ — a proxy/load-balancer idle timeout, a server restart
mid-run, or a durable log whose terminal append never landed — returns normally,
so no catch fired and the client came to rest on
`status: 'generating'`, `isLoading: false`, `result: null`, with `onError` never
called. Worse, the resume snapshot stayed `running`, so every subsequent mount
rejoined the same dead run and repeated the same outcome.

Both clients now throw when the stream ends with no terminal chunk seen (and the
read wasn't aborted by `stop()` / `dispose()`), which routes the failure through
the existing error path: `status: 'error'`, `error` set, `onError` fired, and the
resume snapshot rewritten to a terminal `error` with a null `resumeState` so
nothing chases it again. This applies to both the initial `generate()` path and
the mount-time `rejoinInFlight` path. A rejoin failure now also fires `onError`,
matching `generate()`.

This is the sibling of the earlier "rejoin settles to error" fix, which covered a
missing and a throwing `joinRun` but not a join that returns cleanly with no
terminal chunk.
