---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-openrouter': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-ollama': minor
'@tanstack/ai-openai': patch
'@tanstack/ai-grok': patch
'@tanstack/ai-groq': patch
---

Make `chat({ stream: false })` actually non-streaming on the wire.

Previously, `chat({ stream: false })` ran `runStreamingText()` and concatenated the SSE response via `streamToText`. The wire request still carried `Accept: text/event-stream` and `"stream": true` in the body — the only practical effect of `stream: false` was that the SDK returned `Promise<string>` instead of `AsyncIterable<StreamChunk>`. Reasoning models with long pre-content thinking phases (Grok 4.3 via OpenRouter was the original repro) could be cut off by sub-30s socket-idle timeouts in proxies along the path.

Now `chat({ stream: false })` calls a new optional adapter method `chatNonStreaming()` that sends `stream: false` directly to the provider and returns a single JSON response. When tools are involved, the dispatch layer drives a wire-level non-streaming agent loop: call `chatNonStreaming`, execute any returned tool calls, append the results, repeat until the model stops requesting tools or the agent-loop strategy halts.

**Adapter API addition.** `TextAdapter.chatNonStreaming(options)` is added as an optional method returning `Promise<NonStreamingChatResult>` (`{ content, reasoning?, toolCalls?, finishReason?, usage? }`). All in-tree adapters implement it:

- `@tanstack/openai-base` — `OpenAIBaseChatCompletionsTextAdapter` and `OpenAIBaseResponsesTextAdapter`. Covers `@tanstack/ai-openai`, `@tanstack/ai-grok`, `@tanstack/ai-groq` automatically.
- `@tanstack/ai-openrouter` — both `OpenRouterTextAdapter` and the Responses variant.
- `@tanstack/ai-anthropic`, `@tanstack/ai-gemini`, `@tanstack/ai-ollama`.

Adapters that don't override `chatNonStreaming` keep the legacy stream-then-concatenate behaviour — out-of-tree adapters continue working unchanged but won't get the wire-level fix until they opt in by implementing the method.

**Behaviour notes:** approval-required tools and pure client-side tools cannot round-trip through a `Promise<string>`; the loop throws an explicit error directing callers to `stream: true` for those flows. Middleware is intentionally not invoked on the non-streaming path, matching the silence of the existing `adapter.structuredOutput` call inside `runAgenticStructuredOutput`. The `Promise<string>` return value remains content-only — reasoning is captured on the internal result for future surfaces but is not part of the public return type.
