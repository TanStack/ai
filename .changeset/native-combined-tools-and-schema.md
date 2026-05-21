---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-groq': patch
'@tanstack/ai-grok': patch
---

Route `chat({ outputSchema, tools })` through the provider's native single-pass call where supported (modern OpenAI Chat Completions + Responses, Claude 4.5+). Closes #605.

Historically, `chat({ outputSchema, tools })` ran the agent loop with `tools` and then issued a separate finalization call against the structured-output adapter for the typed answer — because most providers couldn't combine `tools` with a schema-constrained response in one call. That has changed for most modern providers, making the second round-trip pure overhead.

**New per-adapter capability:** `TextAdapter.supportsCombinedToolsAndSchema?(modelOptions?)`. Adapters that opt in receive a JSON Schema on `TextOptions.outputSchema` in `chatStream` and wire it into the upstream request alongside `tools`. The engine harvests the final-turn JSON from the agent loop's accumulated text — no separate finalization call, no `'structuredOutput'` middleware phase.

**Per-adapter status:**

- **OpenAI (Chat Completions + Responses):** opted in. `response_format: json_schema` / `text.format: json_schema` is attached when `outputSchema` is set.
- **Anthropic:** opted in for Claude 4.5+ (Opus / Sonnet / Haiku 4.5, 4.6, 4.6-fast, 4.7, 4.7-fast). Wires `output_format: { type: 'json_schema', schema }` on the beta Messages request. Pre-4.5 Claude models keep the forced-tool finalization workaround.
- **Groq:** explicitly opts out — the Groq API rejects `response_format` + `tools` + `stream` with HTTP 400 ("Streaming and tool use are not currently supported with Structured Outputs").
- **Grok (xAI):** opts out pending per-model gating (Grok 4 supports the combination; Grok 2/3 reject it) — follow-up.
- **OpenRouter, Gemini, Ollama:** unchanged; still take the finalization path.

**Backward compatibility:**

- `'structuredOutput'` middleware phase still fires for fallback-path adapters. It does NOT fire for adapters that handle the combination natively — middleware sees the run through `'beforeModel'` / `'modelStream'` as usual.
- `onStructuredOutputConfig` keeps its existing surface but only fires on the fallback path.
- No call-site changes required.
