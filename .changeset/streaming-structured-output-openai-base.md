---
'@tanstack/openai-base': minor
---

feat: centralised `structuredOutputStream` on both `OpenAICompatibleChatCompletionsTextAdapter` and `OpenAICompatibleResponsesTextAdapter`. Subclasses (`@tanstack/ai-openai`, `@tanstack/ai-grok`, `@tanstack/ai-groq`, `@tanstack/ai-openrouter`) inherit a single-request streaming structured-output path — Chat Completions uses `response_format: json_schema` + `stream: true`; Responses uses `text.format: json_schema` + `stream: true`. Reasoning is surfaced via the existing `extractReasoning` hook (Chat Completions) or Responses-API event-type discrimination (Responses), and final parsed JSON flows through the existing `transformStructuredOutput` hook. A new protected `isAbortError(error)` hook on both bases duck-types abort detection so `RUN_ERROR { code: 'aborted' }` is emitted consistently across SDK error types — subclasses with proprietary error classes (e.g. `@openrouter/sdk`'s `RequestAbortedError`) override.
