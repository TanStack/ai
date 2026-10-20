---
'@tanstack/openai-base': patch
---

Parallel tool calls stay separate when the provider leaves out `index` on the streamed deltas (Gemini's OpenAI-compatible endpoint, for example). Before, they merged into one call with joined arguments. A delta with a new id, or a name without an id after a named call, now starts the next call, and any other delta continues the latest one.
