---
'@tanstack/ai-gemini': patch
---

Count thinking tokens in `completionTokens`. Gemini reports `thoughtsTokenCount` separately from `candidatesTokenCount` but bills both as output, so `completionTokens` was lower than `totalTokens - promptTokens` for thinking models. `completionTokensDetails.reasoningTokens` is unchanged.
