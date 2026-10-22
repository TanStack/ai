---
'@tanstack/ai': minor
---

Add the `onGuardToolCall` middleware hook for checks that must always run, such as permissions.

- It runs for every tool call, after all `onBeforeToolCall` hooks and after the `inputSchema` check. `hookCtx.args` holds the final checked arguments that the tool gets.
- The guard of every middleware runs, in order, until one returns a decision. An earlier `onBeforeToolCall` decision does not skip it.
- Return `{ type: 'skip', result }` to deny the call. The tool does not run, and the model gets `result`, the same as an `onBeforeToolCall` skip. Return `{ type: 'abort', reason }` to abort the run.
- It runs before a server tool runs and before a client tool goes to the client. A guard cannot change the arguments.
- The new `GuardToolCallDecision` type is exported.
