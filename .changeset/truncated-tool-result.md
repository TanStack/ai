---
'@tanstack/ai': minor
---

A tool call in a model answer that stopped at the output limit (finish reason `length`) never runs. The model can send it again when the loop strategy goes on.

- Behavior change: `chat()` never runs a tool call of an answer that stopped at the output limit. The input of such a call can be incomplete JSON. The call asks for no approval, and the client does not run a client tool for it. Before, such a call ran in some cases, for example as a client tool with `{}` input, or as a pending call of the next `chat()` request.
- Each cut call gets an error tool result. The default text tells the model to send the call again.
- The default `agentLoopStrategy` is now `combineStrategies([maxIterations(5), untilFinishReason(['length'])])`. By default, a cut answer ends the run with the finish reason `length`, as before.
- With a strategy that goes on after `length` (for example `maxIterations(5)`), the model is called again. The `RUN_FINISHED` event of the cut answer then has the finish reason `tool_calls`, so the client keeps the stream open.
- In a history message with `metadata.tanstack.finishReason: 'length'`, a call input that is not JSON goes to the provider as `{}`. Before, Bedrock threw on such a cut input.
- Middleware `onAfterToolCall` gets each cut call, with `ok: false` and an `Error` with the code `'max_tokens'`. Return `{ type: 'replaceResult', result }` to change the error text.
- Each assistant message that `chat()` stores on the server keeps the finish reason of its model call in `metadata.tanstack.finishReason`.

Migration: if you pass your own `agentLoopStrategy` and want a cut answer to end the run, add `untilFinishReason(['length'])` to it with `combineStrategies`.
