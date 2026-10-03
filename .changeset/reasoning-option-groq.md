---
'@tanstack/ai-groq': minor
---

Breaking: set reasoning with `chat({ reasoning })`. `modelOptions.reasoning_effort` is removed. Qwen 3 gets `default` or `none`. `reasoning_format` and `include_reasoning` stay in `modelOptions`.
