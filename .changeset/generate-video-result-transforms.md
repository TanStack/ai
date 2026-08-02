---
'@tanstack/ai': patch
---

Fix `generateVideo` dropping result transforms and run identity, which made a persisted video restore as nothing.

Streaming video was the only media activity that never called `applyGenerationResultTransforms`, and never put the caller's `threadId` / `runId` on the middleware context. Because `withGenerationPersistence` registers BOTH its artifact capture and its run-record `result` write as result transforms — pushed onto an optional `ctx.resultTransforms` — both silently no-opped. A completed video therefore stored a run record with `status: 'complete'` and nothing else: no result metadata, no artifact refs, no stored bytes, and no thread link (the run was filed under the internal `requestId`). On reload the client found no output artifact and restored nothing.

Streaming video now applies the transforms to its terminal result before yielding it, so the `generation:result` chunk and the stored run record carry the same URLs — including the durable app-origin URL that `artifactUrl` stamps. It also passes `threadId`, `runId`, and `artifactInputs` into the middleware context, matching `generateImage`.

`threadId` is now a documented option on `generateVideo` (it previously had none — callers passing one via an object spread type-checked but were silently ignored). When omitted, an id is still minted for the `RUN_STARTED` / `RUN_FINISHED` wire chunks, but the middleware context gets `undefined` rather than the minted value: a fabricated thread id is a slot no client can hydrate by, which is worse than recording no link at all.
