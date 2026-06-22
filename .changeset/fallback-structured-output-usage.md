---
'@tanstack/ai': patch
---

fix: forward token usage on the structured-output fallback path

`fallbackStructuredOutputStream` — used by `chat({ outputSchema, stream: true })`
whenever an adapter resolves the schema through the non-streaming
`structuredOutput()` rather than a native streaming or combined path (in practice
Ollama, plus Anthropic and Gemini models that predate combined tools+schema
support) — wrapped `structuredOutput()` but dropped the `usage` from its result.
Consumers reading `RUN_FINISHED.usage` saw `undefined`, and the engine's
`runOnUsage` middleware hook (gated on `chunk.usage`) never fired, so
cost-tracking and observability layers reported zero token counts on that path.

The synthesized `RUN_FINISHED` now carries the adapter-reported `usage`, matching
the native streaming path. Adapters that don't report usage are unaffected (no
`usage` key is emitted).
