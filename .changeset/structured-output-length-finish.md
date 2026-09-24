---
'@tanstack/ai': patch
'@tanstack/openai-base': patch
'@tanstack/ai-openrouter': patch
---

Structured output now reports a response that was cut off at the output cap (`finish_reason: "length"`) as a truncation error instead of a JSON parse error or a "no content" / "missing structured result" error. This covers `chat({ outputSchema })` in native combined mode (error code `max_tokens`), `structuredOutputStream()` in `openai-base` and `ai-openrouter` (`RUN_ERROR` with code `max_tokens`), and their non-stream `structuredOutput()`. A truncated document used to read as a schema failure; the error now says the token limit was reached.
