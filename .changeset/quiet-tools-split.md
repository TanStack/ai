---
'@tanstack/openai-base': patch
---

Parallel tool calls stay separate when the provider leaves out `index` on the streamed deltas (Gemini's OpenAI-compatible endpoint, for example). Before, they merged into one call with joined arguments. A different id starts the next call once the current call has an id. A different name does so when the delta has no id, or when the current call still has no id. Any other delta without an index continues the latest call. A repeated name stays on that call.
