---
'@tanstack/ai': minor
---

A middleware `onAfterToolCall` hook can now replace the result of a tool call. Return `{ type: 'replaceResult', result }` from the hook.

- The model and the stream (`TOOL_CALL_RESULT`) get the new result.
- Middleware run in order. Each hook gets the result of the hook before it as `info.result`.
- An error result stays an error.
- A hook that returns `undefined`, or any value that is not a `replaceResult` decision, keeps the result.
- `onAfterToolCall` after an `onBeforeToolCall` skip now gets the parsed skip result, the same value that goes to the model.
- The new `AfterToolCallDecision` type is exported from `@tanstack/ai`.
