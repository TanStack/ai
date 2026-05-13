---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openai': patch
'@tanstack/ai-openrouter': patch
---

Unify the summarize subsystem on a shared chat-stream wrapper, plumb `modelOptions` through end-to-end, and tighten the `TProviderOptions` generic.

**Provider summarize adapters now share one implementation.** Anthropic, Gemini, Ollama, and OpenRouter previously each shipped a bespoke 200–300 LOC summarize adapter that re-implemented streaming, error handling, usage accounting, and chunk assembly on top of their text adapter. They now construct a `ChatStreamSummarizeAdapter` (formerly `ChatStreamWrapperAdapter`, renamed and exported from `@tanstack/ai/activities`) wrapping their own text adapter, matching the existing OpenAI/Grok pattern. Removes ~600 LOC of duplicated logic across the six providers and ensures behavioural parity.

**`SummarizationOptions.modelOptions` now reaches the wire.** Previously the activity layer (`runSummarize` / `runStreamingSummarize`) silently dropped `modelOptions` when building the internal `SummarizationOptions` it forwarded to the adapter. Provider-specific knobs (Anthropic cache control, OpenRouter plugins, Gemini safety settings, Groq tuning params, …) now flow through correctly.

**Provider summarize types resolve from the wrapped text adapter.** Each provider previously shipped a bespoke `XSummarizeProviderOptions` interface (a partial copy of its text provider options). Those interfaces are removed; summarize provider options are now inferred from the text adapter's `~types` via the new `InferTextProviderOptions<TAdapter>` helper exported from `@tanstack/ai/activities`. IntelliSense for `modelOptions` on `summarize({ adapter: openai('gpt-4o'), … })` now matches what `chat({ adapter: openai('gpt-4o'), … })` would show.

**`SummarizeAdapter` interface methods are now generic in `TProviderOptions`.** `summarize` and `summarizeStream` previously took `SummarizationOptions` (defaulted, so `modelOptions` was effectively `Record<string, any>` regardless of the adapter's typed shape). They now take `SummarizationOptions<TProviderOptions>`, threading the class's `TProviderOptions` generic through. Source-compatible for callers that didn't specify the generic; type-tighter for implementers and downstream consumers.

**Generic constraint and default tightened across the summarize surface.** `SummarizationOptions`, `SummarizeAdapter`, `BaseSummarizeAdapter`, and `ChatStreamSummarizeAdapter` move from a mixed `extends object = Record<string, any>` / `extends object = Record<string, unknown>` set of declarations to a single `extends Record<string, unknown> = Record<string, unknown>` definition. Forces unparameterised consumers to narrow before indexed access on `modelOptions`. No public-surface signature change for callers that supply a concrete provider-options shape (every shipping adapter does).

Bespoke `*SummarizeProviderOptions` interfaces (e.g. `OpenAISummarizeProviderOptions`, `AnthropicSummarizeProviderOptions`, `GeminiSummarizeProviderOptions`, `OllamaSummarizeProviderOptions`, `OpenRouterSummarizeProviderOptions`) are removed from the provider packages' public exports. Consumers who imported them should switch to inferring the type from the adapter (`InferTextProviderOptions<typeof adapter>`) or remove the explicit annotation (it'll be inferred from the adapter argument).
