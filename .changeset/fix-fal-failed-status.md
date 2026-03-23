---
'@tanstack/ai-fal': patch
---

fix: handle FAILED queue status from fal.ai to prevent infinite polling

Added `FAILED` to `FalQueueStatus` type and mapped it to `'failed'` status. Changed the default case in status mapping from `'processing'` to `'failed'` so unknown statuses don't cause infinite polling. Error details from the fal response are now surfaced in `VideoStatusResult.error`.
