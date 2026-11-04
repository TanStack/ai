---
'@tanstack/ai-fal': minor
---

`falVideo` implements the optional `cancelVideoJob(jobId, options?)` with `fal.queue.cancel`. A streaming `generateVideo()` calls it when the caller aborts.
