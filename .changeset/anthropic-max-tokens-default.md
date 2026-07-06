---
'@tanstack/ai-anthropic': patch
---

Default Anthropic `max_tokens` to the selected model's real output ceiling
(`max_output_tokens` from model metadata — e.g. 64K for Sonnet, 128K for Opus)
when the caller doesn't pass one, instead of a hard-coded `1024` that silently
truncated long responses with `stop_reason: "max_tokens"` (#849). Unknown
models fall back to a safe constant. `max_tokens` is a ceiling, not a
reservation, so this costs nothing unless the model genuinely produces more.

The adapter also now logs a warning when a response is truncated while using the
defaulted (caller-unspecified) cap, so the truncation isn't silently attributed
to the model "doing nothing". Callers that set `modelOptions.max_tokens`
explicitly are unaffected.

The non-streaming structured-output path (`structuredOutput()`) clamps this
default to the Anthropic SDK's non-streaming-safe limit (~21K tokens). The SDK
refuses a non-streaming request whose `max_tokens` could exceed its 10-minute
timeout, so without the clamp the full-ceiling default would make every
`chat({ outputSchema })` call on a fallback-path model throw "Streaming is
required for operations that may take longer than 10 minutes". The streaming
chat path keeps the model's full ceiling.
