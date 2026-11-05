---
'@tanstack/ai-bedrock': patch
---

A Bedrock Converse response that ends with `stopReason: 'guardrail_intervened'` now reports `finishReason: 'content_filter'`, in both the chat stream and the structured-output stream. Before, it was reported as a normal `stop`, so callers could not tell that a guardrail had cut the answer.
