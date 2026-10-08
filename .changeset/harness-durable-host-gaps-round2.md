---
'@tanstack/ai': minor
'@tanstack/ai-harness': minor
---

- A model answer with tool calls that stops at the output limit can continue. With the new `chat({ truncatedToolResult })` option (a string, or a function that gets `{ toolCallId, toolName }`), the answer keeps its tool calls. Each call that the provider did not run gets that text as an error result and does not run. Then the model is called again, and the call counts as an iteration. Without the option, nothing changes. `durability.truncatedToolResult` of the harness takes the same string or function. When it is set, the harness passes it to each `chat()` call of a turn, and recovery uses the same text.
- On a durable host, a failed model call writes its retry count to the log before `turn.onModelError` runs. Before, the count landed with the next model call, so a host that stopped during the backoff lost it, and the next host could retry one time too many.
