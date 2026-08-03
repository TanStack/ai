---
'@tanstack/ai': minor
---

`summarize()` accepts generation middleware, so summaries can be persisted.

`useSummarize({ persistence: true, threadId })` type-checked exactly like the six media hooks, but `summarize()` took no `middleware`, so no library path could ever write its run record and a reload restored nothing. It now takes `middleware` like the `generate*` activities: one `onStart`, the result transforms applied to the `SummarizationResult`, then `onFinish` / `onError`, in both streaming and non-streaming mode (a consumer that disconnects mid-summary fires `onAbort`). In streaming mode the transformed result is what is yielded, so the client and the persisted record hold the same object.

`GenerationActivity` gained `'summarize'`, and `otelMiddleware` maps it to the `summarize` operation name. Summaries are text, so there are no artifacts: a persistence middleware stores the run record and its result and nothing else.
