---
'@tanstack/ai-anthropic': minor
---

Add `claude-haiku-5-5` to `ANTHROPIC_MODELS`. With `chat({ reasoning })`, the model takes adaptive thinking with the levels `low` to `max`, or `off`, and no token budget. Its types reject the sampling parameters and `computerUseTool()`.
