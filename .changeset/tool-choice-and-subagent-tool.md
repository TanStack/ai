---
'@tanstack/ai': minor
'@tanstack/openai-base': minor
---

New `chat()` options for coding agents.

- **`toolChoice`.** `chat({ toolChoice })` takes `'auto'`, `'none'`, `'required'`, or `{ type: 'tool', name }`. A middleware can change it for one model call. A tool choice in `modelOptions` wins. No tool choice goes out when the request has no tools.
- **`replaceResult`.** `onAfterToolCall` can return `{ type: 'replaceResult', result }` to change the result that the client and the next model call see. Several middlewares chain.
- **One subagent tool.** With `subagents: { tool: 'single' }`, the model picks an agent by name in one `subagent` tool. An agent with an `inputSchema` takes `input`, and an agent without one takes an optional `prompt`. A `sessionId` continues an earlier child of the same agent (with `withPersistence`), and `background` runs the child in the background. `LoadChild` can return the name of that agent.
- **`@tanstack/openai-base`** sends `tool_choice` from Chat Completions and Responses, and exports `toChatCompletionsToolChoice` and `toResponsesToolChoice`.
