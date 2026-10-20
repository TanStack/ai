---
'@tanstack/openai-base': patch
---

Parallel tool calls stay separate when the provider leaves out `index` on the streamed deltas (Gemini's OpenAI-compatible endpoint, for example). Before, they merged into one call with joined arguments. A delta with a new id now starts the next call, and a delta without an id continues the latest one.
