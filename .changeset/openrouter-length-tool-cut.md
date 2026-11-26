---
'@tanstack/ai-openrouter': patch
---

Report `length`, not `tool_calls`, when the output limit cuts a streamed Chat Completions tool call. With `tool_calls`, the engine ran the cut call when its partial arguments happened to parse; with `length` it closes the call without running it, as with the other OpenAI-compatible adapters.
