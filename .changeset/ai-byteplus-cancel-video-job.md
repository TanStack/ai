---
'@tanstack/ai-byteplus': minor
---

`byteplusVideo` implements the optional `cancelVideoJob(jobId, options?)` with `DELETE /contents/generations/tasks/{id}`. Ark cancels only a queued task. A streaming `generateVideo()` calls it when the caller aborts.
