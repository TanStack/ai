---
'@tanstack/openai-base': minor
'@tanstack/ai-groq': patch
'@tanstack/ai-openrouter': patch
---

Migrate `ai-groq` and `ai-openrouter` onto `OpenAICompatibleChatCompletionsTextAdapter` so they share the stream accumulator, partial-JSON tool-call buffer, RUN_ERROR taxonomy, and lifecycle gates with `ai-openai` / `ai-grok`. Removes ~1k LOC of duplicated stream processing.

`@tanstack/openai-base` adds three protected hooks on `OpenAICompatibleChatCompletionsTextAdapter` so providers with non-OpenAI SDK shapes can reuse the base: `callChatCompletion` and `callChatCompletionStream` (SDK call sites for non-streaming and streaming Chat Completions), and `extractReasoning` (surface reasoning content from chunk shapes that carry it, e.g. OpenRouter's `delta.reasoningDetails`, into the base's REASONING_* + legacy STEP_STARTED/STEP_FINISHED lifecycle). Also adds `transformStructuredOutput` for subclasses (like OpenRouter) that preserve nulls in structured output instead of converting them to undefined.

`@tanstack/ai-groq` drops the `groq-sdk` dependency in favour of the OpenAI SDK pointed at `https://api.groq.com/openai/v1` (the same pattern as `ai-grok` against xAI). The Groq-specific quirk where streaming usage arrives under `chunk.x_groq.usage` is preserved via a small `processStreamChunks` wrapper that promotes it to the standard `chunk.usage` slot.

`@tanstack/ai-openrouter` keeps `@openrouter/sdk` (the source of truth for OpenRouter's typed provider routing, plugins, and metadata) but routes the SDK call through the base via overridden hooks. A small request shape converter (`max_tokens` → `maxCompletionTokens`, etc.) and chunk shape adapter (camelCase → snake_case for the base's reader) bridge the SDKs. No public API changes; provider routing, app attribution headers (`httpReferer`, `appTitle`), reasoning variants (`:thinking`), and `RequestAbortedError` handling are preserved.

`ai-ollama` remains on `BaseTextAdapter` — its native API uses a different wire format from Chat Completions (different chunk shape, request shape, tool-call streaming, and reasoning surface) and doesn't fit the OpenAI base without rebuilding most of the processing it would otherwise inherit. Migrating it remains a separate effort.
