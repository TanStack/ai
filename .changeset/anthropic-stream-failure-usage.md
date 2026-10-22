---
'@tanstack/ai-anthropic': patch
---

Report the input token usage when a streamed response fails after its first event. A dropped connection or an Anthropic `error` event in the stream ended in a `RUN_ERROR` with no `usage`. Anthropic bills the input tokens of that call, so this `RUN_ERROR` now carries the `usage` that `message_start` reported. The output count is the one from `message_start`, so it can be lower than the real output count.
