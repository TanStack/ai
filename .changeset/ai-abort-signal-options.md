---
'@tanstack/ai': minor
---

New optional cancel options. Old calls work the same.

- `embed()` takes `abortSignal` and `timeout`. The effective signal reaches the adapter as `EmbeddingOptions.abortSignal`.
- `getVideoJobStatus()` takes `abortSignal` and `timeout`. The video adapter contract adds an optional `{ abortSignal }` to `getVideoStatus(jobId, options?)` and `getVideo(jobId, options?)`. The streaming `generateVideo()` poll passes its signal to both.
- `uploadFile()`, `getFile()`, and `deleteFile()` take `abortSignal`. `FilesAdapter.upload/get/delete` take an optional `{ abortSignal }`.
- `realtimeToken()` takes `abortSignal`. `RealtimeTokenAdapter.generateToken(options?)` and `RealtimeAdapter.connect(token, clientTools?, options?)` take an optional `{ abortSignal }`.
- `decide()` and `rerank()` take `timeout`, and race the adapter call against the signal like the other activities.
- `GenerationMiddlewareContext` has an optional `signal`: the effective activity signal.
