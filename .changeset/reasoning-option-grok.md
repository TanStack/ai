---
'@tanstack/ai-grok': minor
---

Breaking: set reasoning with `chat({ reasoning })`. `modelOptions.reasoning`, `GrokReasoning`, and `GrokReasoningEffort` are removed. `grok-build-0.1` takes no reasoning, because the xAI API refuses it.
