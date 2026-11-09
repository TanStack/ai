---
'@tanstack/ai-gemini': patch
---

Report Gemini content filter stops (SAFETY, RECITATION, BLOCKLIST, PROHIBITED_CONTENT, SPII, IMAGE_SAFETY, IMAGE_PROHIBITED_CONTENT, IMAGE_RECITATION) as `finishReason: "content_filter"` on chat streams, and as a `content_filter` error from `structuredOutput` and `structuredOutputStream`.
