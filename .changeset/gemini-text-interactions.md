---
'@tanstack/ai-gemini': minor
'@tanstack/ai': minor
---

feat(ai-gemini): add experimental `geminiTextInteractions()` adapter for Gemini's stateful Interactions API (Beta)

Routes through `client.interactions.create` instead of `client.models.generateContent`, so callers can pass `previous_interaction_id` via `modelOptions` and let the server retain conversation history. On each run, the returned interaction id is surfaced on the `RUN_FINISHED` event's new `providerMetadata.interactionId` field — feed that back on the next turn via `modelOptions.previous_interaction_id`.

Scope: text/chat output with function tools. Built-in Gemini tools (`google_search`, `code_execution`, `url_context`, `file_search`, `computer_use`) and image/audio output via Interactions are not yet supported on this adapter — use `geminiText()` or follow-up adapters for those.

Marked `@experimental` — the underlying Interactions API is Beta and Google explicitly flags possible breaking changes.

feat(ai): add `providerMetadata?: Record<string, unknown>` to `RunFinishedEvent` for surfacing provider-specific response identifiers (e.g. Gemini interactionId; paves the way for OpenAI responseId later).
