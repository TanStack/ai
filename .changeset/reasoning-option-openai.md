---
'@tanstack/ai-openai': minor
---

Breaking: set reasoning with `chat({ reasoning })`. `modelOptions.reasoning` and the `OpenAIReasoningOptions` types are removed; the adapter sends the level as `reasoning.effort` with a summary.

`openaiCompatible` takes `compat` for a provider's request quirks (thinking format, developer role, `maxTokensField`, the DeepSeek `reasoning_content` replay, `store`, strict tools, session headers, and Anthropic cache markers), and each model entry takes `reasoning` (its level map) and its own `compat`.
