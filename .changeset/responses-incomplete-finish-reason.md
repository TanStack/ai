---
'@tanstack/openai-base': patch
---

A Responses stream that ends with `response.incomplete` because of `max_output_tokens` or `content_filter` now finishes with `RUN_FINISHED` carrying the response's usage and `finishReason` `'length'` or `'content_filter'`, like the Chat Completions adapter, instead of `RUN_ERROR`. `response.failed` and an incomplete response with another or no reason still end in `RUN_ERROR`.
