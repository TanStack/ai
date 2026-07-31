---
'@tanstack/ai': minor
---

Fix non-streaming `generateVideo()` losing the generation when persistence is on.

A non-streaming `generateVideo()` call only SUBMITS a job — the video does not exist until a later poll — but it fired `onFinish` as soon as the job was queued and never applied the result transforms, and it never put the caller's `threadId` on the middleware context. With `withGenerationPersistence` that meant `generateVideo({ threadId, middleware })` threw for want of a scope, and (once given one) would have stamped the run `completed` with no result, no url, and no stored bytes, while the eventual result had nowhere to land.

Submitting a job now OPENS the run and `getVideoJobStatus()` closes it, with the two calls correlated by the provider's **`jobId`** — the one id a poller structurally cannot be missing, since it cannot poll without it. Nothing else has to be threaded through:

- `generateVideo()` (non-streaming) passes `threadId` and the prompt inputs to middleware, files the run under an id derived from the provider + `jobId`, applies the result transforms to the submission (so the run record captures the `jobId` and stays resumable from a later request or process), and fires **no terminal hook**.
- `getVideoJobStatus()` accepts `threadId` and `middleware`, and recomputes the same run id from `adapter` + `jobId`. On the poll that first observes a terminal job state it resumes that run, applies the result transforms — which is where persistence copies the video into the blob store and rewrites `url` to a durable one, so the returned result and the stored record carry the same urls — and fires `onFinish`, or `onError` when the job (or the url fetch) failed. Intermediate polls invoke nothing. Its result gained `jobId`, `expiresAt`, and `artifacts`; `VideoJobResult` gained `artifacts` (refs for persisted prompt INPUTS, e.g. a start frame).
- `runId` on a non-streaming `generateVideo()` call is **ignored** (it remains the wire run id in stream mode). The run id has to be recomputable by the poll from the `jobId` alone; honoring a custom one would reintroduce the failure this avoids — a caller who set it on the submit and forgot it on the poll would silently open a second record while the first sat unfinished forever.

Two consequences worth knowing. Because the job id only exists once the provider accepts the job, `onStart` now fires AFTER the submit request, so an `otelMiddleware()` span covers the run from acceptance onward rather than the submit round-trip, and a submission that FAILS (no job to key on) opens and immediately fails a run under the call's `requestId` — terminal and unresumable, but filed under the thread so a hydrating client sees the failure. And `threadId` must reach the poll: omitting it makes generation persistence throw loudly rather than file the finished video where nothing can hydrate it.
