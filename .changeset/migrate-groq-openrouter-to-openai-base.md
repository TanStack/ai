---
'@tanstack/ai-openai-compatible': minor
'@tanstack/ai-groq': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai': patch
---

Migrate `ai-groq` and `ai-openrouter` onto `OpenAICompatibleChatCompletionsTextAdapter` so they share the stream accumulator, partial-JSON tool-call buffer, RUN_ERROR taxonomy, and lifecycle gates with `ai-openai` / `ai-grok`. Removes ~1k LOC of duplicated stream processing.

`@tanstack/ai-openai-compatible` adds four protected hooks on `OpenAICompatibleChatCompletionsTextAdapter` so providers with non-OpenAI SDK shapes can reuse the base: `callChatCompletion` and `callChatCompletionStream` (SDK call sites for non-streaming and streaming Chat Completions), `extractReasoning` (surface reasoning content from chunk shapes that carry it, e.g. OpenRouter's `delta.reasoningDetails`, into the base's REASONING\_\* + legacy STEP_STARTED/STEP_FINISHED lifecycle), and `transformStructuredOutput` (subclasses like OpenRouter can preserve nulls in structured output instead of converting them to undefined).

`@tanstack/ai-openai-compatible` fixes two error-handling regressions in the shared base: `structuredOutput` now throws a distinct `"response contained no content"` error rather than letting empty content cascade into a misleading JSON-parse error, and the post-loop tool-args drain block now logs malformed JSON via `logger.errors` (matching the in-loop finish_reason path) so truncated streams emitting partial tool args are debuggable instead of silently invoking the tool with `{}`.

`@tanstack/ai` normalizes abort-shaped errors (`AbortError`, `APIUserAbortError`, `RequestAbortedError`) to a stable `{ message: 'Request aborted', code: 'aborted' }` payload in `toRunErrorPayload`, so consumers can discriminate user-initiated cancellation from other failures without matching on provider-specific message strings.

`@tanstack/ai-groq` drops the `groq-sdk` dependency in favour of the OpenAI SDK pointed at `https://api.groq.com/openai/v1` (the same pattern as `ai-grok` against xAI). The Groq-specific quirk where streaming usage arrives under `chunk.x_groq.usage` is preserved via a small `processStreamChunks` wrapper that promotes it to the standard `chunk.usage` slot.

`@tanstack/ai-openrouter` keeps `@openrouter/sdk` (the source of truth for OpenRouter's typed provider routing, plugins, and metadata) but routes the SDK call through the base via overridden hooks. A small request shape converter (`max_tokens` → `maxCompletionTokens`, etc.) and chunk shape adapter (camelCase → snake_case for the base's reader) bridge the SDKs. No public API changes; provider routing, app attribution headers (`httpReferer`, `appTitle`), reasoning variants (`:thinking`), and `RequestAbortedError` handling are preserved. Fixes: `stream_options.include_usage` is now correctly camelCased to `includeUsage` so streaming `RUN_FINISHED.usage` is populated (previously silently dropped by the SDK Zod schema); mid-stream `chunk.error.code` is stringified so provider error codes (401, 429, 500, …) survive the `toRunErrorPayload` narrow; assistant `toolCalls[].function.arguments` is stringified to match the SDK's `string` contract; and `convertMessage` now mirrors the base's fail-loud guards (throws on empty user content and unsupported content parts) instead of silently sending empty paid requests.

`ai-ollama` remains on `BaseTextAdapter` — its native API uses a different wire format from Chat Completions (different chunk shape, request shape, tool-call streaming, and reasoning surface) and doesn't fit the OpenAI base without rebuilding most of the processing it would otherwise inherit. Migrating it remains a separate effort.
