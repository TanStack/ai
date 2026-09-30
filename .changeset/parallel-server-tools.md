---
'@tanstack/ai': minor
---

Run the server tools of one model turn at the same time. `chat()` used to run them one after another, so a turn with several slow tools took as long as all of them together.

- Every call is still prepared in call order (argument parse, input schema check, approval check, `onBeforeToolCall`). Then the server tools start together.
- `onAfterToolCall` fires for each tool when it finishes. The model still gets the results in the order of its calls.
- A tool that has not started when the run aborts does not start. It gets the error result "Operation aborted".
- Opt out per run with `chat({ toolExecution: 'sequential' })`, or per tool with `toolDefinition({ sequential: true })`. A turn that calls a `sequential` tool runs all of its tools one at a time.
