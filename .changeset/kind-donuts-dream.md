---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openai': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-groq': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-ollama': minor
'@tanstack/ai-event-client': minor
'@tanstack/ai-devtools-core': patch
---

Enhanced token usage reporting for every provider.

`TokenUsage` is now the single canonical run-usage type, exported by both
`@tanstack/ai` and `@tanstack/ai-event-client`. It carries optional detailed
breakdowns alongside the core token counts: `promptTokensDetails` /
`completionTokensDetails` (cached, reasoning, audio, and per-modality tokens),
`durationSeconds` for duration-billed models (e.g. Whisper transcription),
`providerUsageDetails` for provider-specific metrics, and `cost` / `costDetails`
for provider-reported cost — so a single `usage` shape covers counts, detailed
breakdowns, and cost.

`@tanstack/ai` still exports `UsageTotals` as a `@deprecated` alias of
`TokenUsage` for backward compatibility; it will be removed in a future release.

Detailed usage is extracted in one place per SDK surface: OpenAI-compatible
providers (OpenAI, Grok, Groq) share the extractors in `@tanstack/openai-base`,
while Anthropic, Gemini, Ollama, and OpenRouter normalize their own provider
usage. The devtools surface cached and reasoning token badges per iteration.
