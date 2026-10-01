---
'@tanstack/ai': minor
---

Run the server tools of one model turn at the same time. `chat()` used to run them one after another, so a turn with several slow tools took as long as all of them together.

- Every call is still prepared in call order (argument parse, input schema check, approval check, `onBeforeToolCall`). Then the server tools start together.
- `onBeforeToolCall` runs for every call before any tool of the turn starts. `onAfterToolCall` fires for each tool when it finishes. The model still gets the results in the order of its calls.
- If the run aborts before the tools start, no tool starts. Each call gets the error result "Operation aborted".
- If a tool or a hook throws, the other tools of the turn finish first. Then the error is thrown.
- `toolCacheMiddleware` no longer dedupes identical calls in one turn, because they run at the same time.
- Opt out with `chat({ toolExecution: 'sequential' })`.
