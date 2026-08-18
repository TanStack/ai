---
'@tanstack/ai-openrouter': patch
---

Exclude the `prediction` parameter from the generated OpenRouter model options. The OpenRouter API newly reports it as a supported parameter, but `@openrouter/sdk`'s `ChatRequest` does not declare it (its outbound schema would strip it), so the generated `Pick<OpenRouterBaseOptions, ... | 'prediction'>` types failed to compile.
