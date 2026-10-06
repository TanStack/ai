---
'@tanstack/ai-anthropic': patch
---

Report token usage when a streamed response stops at `max_tokens`. The `RUN_ERROR` with `code: 'max_tokens'` now carries `usage`, the same as `RUN_FINISHED` does for the other stop reasons. Anthropic bills these tokens, so code that counts `usage` no longer misses them.

Keep the input, cache, and server tool counts of a stream when its closing `message_delta` leaves them out. Some Anthropic-compatible servers send only `output_tokens` there, so `usage` reported 0 input tokens. The adapter now takes each missing count from `message_start`, the same as the Anthropic SDK does.
