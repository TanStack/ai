---
'@tanstack/ai-grok': minor
---

feat: native streaming structured output. `GrokTextAdapter.structuredOutputStream()` issues a single Chat Completions request with `stream: true` + `response_format: { type: 'json_schema', strict: true }`, surfacing JSON deltas as `TEXT_MESSAGE_CONTENT` chunks and a final `CUSTOM` `structured-output.complete` event with the parsed object — replacing the previous two-request (streamed text → non-streamed JSON) flow when used with `chat({ outputSchema, stream: true })`.
