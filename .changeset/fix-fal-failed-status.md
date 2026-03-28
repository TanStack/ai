---
'@tanstack/ai-fal': patch
'@tanstack/ai': patch
---

fix: handle errors from fal result fetch on completed jobs

fal.ai does not return a FAILED queue status — invalid jobs report COMPLETED, and the real error (e.g. 422 validation) only surfaces when fetching results. `getVideoUrl()` now catches these errors and extracts detailed validation messages. `getVideoJobStatus()` returns `status: 'failed'` when the result fetch throws on a "completed" job.
