---
'@tanstack/ai': minor
'@tanstack/ai-harness': minor
---

A run that the agent loop stops before the model finished now says so. When `agentLoopStrategy` (for example `maxIterations`) or a middleware `onShouldContinue` returns `false` while tool results wait for the next model call, `chat()` ends the stream with a `RUN_FINISHED` that has `metadata.tanstack.loopStopped: true`, and the last stored assistant message gets the same field. `finishReason` stays the reason of the last model call (`tool_calls`, or `length` for a cut answer). A run that the model ends has no `loopStopped`.

In `@tanstack/ai-harness`, a turn that the loop stops settles with `{ outcome: 'completed', loopStopped: true }`. `session.settled()`, the `harness.input.settled` event of `createHarnessClient().events()`, and the transcript all carry it.
