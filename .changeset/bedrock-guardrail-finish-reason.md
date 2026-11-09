---
'@tanstack/ai-bedrock': patch
---

A Bedrock Converse chat stream that ends with `stopReason: 'guardrail_intervened'` now reports `finishReason: 'content_filter'` on `RUN_FINISHED`. Before, it was a normal `stop`. The structured-output stream uses the same finish reason when the body is valid JSON. When a guardrail leaves no JSON, that stream reports `RUN_ERROR` with code `content_filter` instead of `empty-response` or `parse-error`.
