---
'@tanstack/ai-grok': minor
---

Switch the Grok text adapter from xAI's Chat Completions API (`/v1/chat/completions`) to the Responses API (`/v1/responses`), and request encrypted reasoning content by default.

**What changed**

- The text adapter now calls `client.responses.create(...)` for both streaming and structured output.
- Streaming emits the full set of AG-UI `REASONING_*` events (`REASONING_START`, `REASONING_MESSAGE_START`, `REASONING_MESSAGE_CONTENT`, `REASONING_MESSAGE_END`, `REASONING_END`) plus the existing legacy `STEP_*` events when the model returns reasoning.
- Function tools now use the Responses-API flat shape (`{ type: 'function', name, description, parameters, strict }`) instead of the Chat Completions nested wrapper.
- Structured output uses `text.format` instead of `response_format`.
- Every request defaults to `store: false` and `include: ['reasoning.encrypted_content']` so encrypted reasoning items are requested in stateless Responses-API workflows (zero-data-retention compatible). Pass `modelOptions: { store: true, include: [] }` to opt back into server-side storage.
- The adapter now fails early if `modelOptions.reasoning.effort` is used with models that xAI currently rejects for that parameter (for example `grok-4.2`), avoiding a less clear provider 400. `grok-4-2-non-reasoning` accepts no reasoning options because it is a non-reasoning model.

**Breaking — `GrokTextProviderOptions`**

The provider options surface now mirrors `@tanstack/ai-openai` (the Responses-API shape). If you reach into `modelOptions` directly:

- `max_tokens` → use the top-level `maxTokens` on `chat()` / `generate()` (mapped to `max_output_tokens`)
- `top_p` → use the top-level `topP`
- `frequency_penalty`, `presence_penalty`, `stop` → not supported on `/v1/responses`; remove
- `user` → unchanged

New fields available in `modelOptions`: `include`, `store`, `previous_response_id`, `reasoning`, `parallel_tool_calls`, `tool_choice`, `max_tool_calls`, `text`, `truncation`, `stream_options`, `metadata`.

Note: xAI does not currently support every `reasoning` sub-option on every reasoning-capable model. For example, `grok-4.2` rejects `reasoning.effort`.

If you only use `chat()` / `generate()` / `summarize()` / `useChat()` (the common path), no changes are required.
