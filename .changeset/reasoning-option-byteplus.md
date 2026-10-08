---
'@tanstack/ai-byteplus': minor
---

Breaking: set reasoning with `chat({ reasoning })`. `thinking`, `reasoning_effort`, `BytePlusThinkingOption`, and `BytePlusReasoningEffort` are removed. The adapter sends `thinking.type`, plus `reasoning_effort` when the level has an effort.
