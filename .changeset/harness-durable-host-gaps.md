---
'@tanstack/ai-harness': minor
---

Fixes and options for steering and recovery.

- A steer that joins a turn no longer removes the per-call `providerMessages` change of an earlier middleware. The model call gets that change and the steer message after it.
- Recovery checks the final answer first. A turn whose final answer is in the log settles `completed`, also when an abort was asked, no attempt is left, or its time limit passed.
- New `durability.interruptedToolResult`. Recovery gives this text to a `replay: 'never'` tool call that a crash cut, as the content and the error of its tool message. Without it, the result is the same as before.
- The `durability.recover` hook can return `{ action: 'run', overrides }`. The recovered turn then runs with these `TurnOverrides` (adapter, reasoning, promptCache, tools). The log does not keep them.
- New `session.recover()` and `host.recover(threadId?)` recover the log again, as `open()` does. A turn that another host held at open runs once its lease expires. The work that the session runs or queues stays as it is, and two calls do not run one input twice.
