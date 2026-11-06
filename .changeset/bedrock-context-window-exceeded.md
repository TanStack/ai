---
'@tanstack/ai-bedrock': patch
---

Report a Converse stream that stops with `stopReason: 'model_context_window_exceeded'` as a `RUN_ERROR` with the `context_overflow` code. It was reported as a clean `RUN_FINISHED` with `finishReason: 'stop'`, although the answer was cut off. This matches the Anthropic adapter.
