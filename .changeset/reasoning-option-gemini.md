---
'@tanstack/ai-gemini': minor
---

Breaking: set reasoning with `chat({ reasoning })`. `thinkingConfig` leaves the chat `modelOptions`, and `GeminiThinkingOptions` is removed. Gemini 3 gets `thinkingLevel`, Gemini 2.5 gets `thinkingBudget`, and the Interactions adapter gets `thinking_level`. Image generation keeps its own `thinkingConfig`.
