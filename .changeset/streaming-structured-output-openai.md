---
'@tanstack/ai-openai': minor
---

feat: native streaming structured output. `OpenAITextAdapter.structuredOutputStream()` issues a single Responses API request with `stream: true` + `text.format: { type: 'json_schema', strict: true }`, surfacing JSON deltas as `TEXT_MESSAGE_CONTENT` chunks and a final `CUSTOM` `structured-output.complete` event with the parsed object — replacing the previous two-request (streamed text → non-streamed JSON) flow when used with `chat({ outputSchema, stream: true })`.
