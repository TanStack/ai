---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
'@tanstack/ai-anthropic': minor
'@tanstack/ai-gemini': minor
'@tanstack/ai-grok': minor
'@tanstack/ai-groq': patch
---

Route `chat({ outputSchema, tools })` through the provider's native single-pass call where supported (modern OpenAI Chat Completions + Responses, Claude 4.5+, Gemini 3.x, Grok 4.x family). Closes #605.

Historically, `chat({ outputSchema, tools })` ran the agent loop with `tools` and then issued a separate finalization call against the structured-output adapter for the typed answer — because most providers couldn't combine `tools` with a schema-constrained response in one call. That has changed for most modern providers, making the second round-trip pure overhead.

**New per-adapter capability:** `TextAdapter.supportsCombinedToolsAndSchema?(modelOptions?)`. Adapters that opt in receive a JSON Schema on `TextOptions.outputSchema` in `chatStream` and wire it into the upstream request alongside `tools`. The engine harvests the final-turn JSON from the agent loop's accumulated text — no separate finalization call, no `'structuredOutput'` middleware phase.

**Per-adapter status:**

- **OpenAI (Chat Completions + Responses):** opted in for all models. `response_format: json_schema` / `text.format: json_schema` attached when `outputSchema` is set.
- **Anthropic:** opted in for Claude 4.5+ (Opus / Sonnet / Haiku 4.5, 4.6, 4.7). Wires `output_config.format` on the beta Messages request. Pre-4.5 Claude models keep the forced-tool finalization workaround. Gated by exported `ANTHROPIC_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
- **Gemini:** opted in for Gemini 3.x (3-pro, 3-flash, 3.1-pro-preview, 3.1-flash-lite). Wires `responseSchema` + `responseMimeType: 'application/json'` into the regular `generateContentStream` call. Gemini 2.x keeps the legacy path. Gated by exported `GEMINI_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
- **Grok (xAI):** opted in for the Grok 4 family (`grok-4`, `grok-4-1-fast-*`, `grok-4-fast-*`, `grok-4-20*`, `grok-4-3`, `grok-code-fast-1`). Inherits the OpenAI Chat Completions wiring from `openai-base`; the override gates the capability claim by model. Grok 2 / 3 keep the legacy path. Gated by exported `GROK_COMBINED_TOOLS_AND_SCHEMA_MODELS`.
- **Groq:** explicitly opts out — the Groq API rejects `response_format` + `tools` + `stream` with HTTP 400 ("Streaming and tool use are not currently supported with Structured Outputs").
- **OpenRouter, Ollama:** unchanged; still take the legacy finalization path. OpenRouter's per-request capability lookup (depends on resolved upstream model) is tracked as a follow-up.

**Backward compatibility:**

- `'structuredOutput'` middleware phase still fires for fallback-path adapters. It does NOT fire for adapters that handle the combination natively — middleware sees the run through `'beforeModel'` / `'modelStream'` as usual.
- `onStructuredOutputConfig` keeps its existing surface but only fires on the fallback path.
- No call-site changes required.
