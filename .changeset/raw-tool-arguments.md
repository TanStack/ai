---
'@tanstack/ai': minor
'@tanstack/openai-base': patch
'@tanstack/ai-openrouter': patch
'@tanstack/ai-bedrock': patch
'@tanstack/ai-mistral': patch
'@tanstack/ai-gemini': patch
'@tanstack/ai-ollama': patch
'@tanstack/ai-anthropic': patch
---

Keep the provider's raw tool argument string for replay.

- Adapters now send the raw argument string as `args` on `TOOL_CALL_END`.
- The tool call in the history keeps that exact string when it is the same JSON value as the parsed input, so the next request sends the provider's own bytes back (for example `1.50`, or an id past `Number.MAX_SAFE_INTEGER`). When the parsed input differs, only the changed values are written again.
- The `TOOL_CALL_END` that reaches the client carries the same string in `metadata.tanstack.args`, so the client history matches the server history. `input` is sent only when JSON keeps it exactly.
- Malformed tool arguments are no longer turned into `{}` by an adapter. The tool gets a "Failed to parse tool arguments as JSON" error that the model can repair. Mistral still ends the run with an error on malformed arguments, as before.
