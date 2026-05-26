---
'@tanstack/ai': patch
'@tanstack/ai-anthropic': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-openrouter': patch
---

Adapters now report token `usage` from the non-streaming `structuredOutput()` call, and `fallbackStructuredOutputStream` forwards it onto the synthesized `RUN_FINISHED` event. Previously the legacy finalization round-trip was invisible to the chat middleware `onUsage` hook — any cost-tracking middleware silently under-counted by exactly one call whenever an adapter without a native `structuredOutputStream` (Anthropic, Gemini, Ollama, OpenRouter) ran agentic structured output through the legacy path.

`StructuredOutputResult` gains an optional `usage: { promptTokens, completionTokens, totalTokens }` field. Adapters without a token count on the wire (or that fail before usage is known) leave it `undefined`, which the engine treats as "no usage to report" — same as before. No consumer-visible behavior change beyond accurate `onUsage` totals.
