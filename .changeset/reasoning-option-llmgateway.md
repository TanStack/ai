---
'@tanstack/ai-llmgateway': minor
---

Breaking: set reasoning with `chat({ reasoning })`. `modelOptions.reasoning_effort` is removed; the adapter sends the level as `reasoning_effort`.
