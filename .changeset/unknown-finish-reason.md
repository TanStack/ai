---
'@tanstack/openai-base': patch
'@tanstack/ai-openrouter': patch
---

The Chat Completions adapters and the OpenRouter chat adapter now end the run with `RUN_ERROR` when the provider sends an unknown finish reason. The error message contains the provider finish reason, for example `Provider finish_reason: error`. Before this fix, the run finished as a success. The `content_filter` behavior does not change. OpenRouter still reports its `error` finish reason as `content_filter`.
