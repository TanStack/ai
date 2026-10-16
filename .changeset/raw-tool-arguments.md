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
- The `TOOL_CALL_END` that reaches the client carries the same string in `metadata.tanstack.args`, so the client history matches the server history. It no longer also carries `metadata.tanstack.input`: in-process `chat()` and `StreamProcessor` parse `input` from `args`. Run the client and the server on the same release: an older client ignores `args`, so it builds the tool input from the streamed deltas only, and a tool call with no deltas (for example an Anthropic server tool) gets no input.
- History converters for Bedrock and the Gemini Interactions API send malformed tool arguments as `{}` instead of failing the request.
- Gemini Interactions: the initial `step.arguments` snapshot goes out as a `TOOL_CALL_ARGS` delta only when no argument deltas follow, so the deltas always add up to the final arguments.
- Malformed tool arguments are no longer turned into `{}` by an adapter. The tool gets a "Failed to parse tool arguments as JSON" error that the model can repair. Mistral still ends the run with an error on malformed arguments, as before.
