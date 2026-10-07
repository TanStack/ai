---
'@tanstack/ai-harness': minor
---

Fixes and options for steering and recovery.

- A steer that joins a turn no longer removes the per-call `providerMessages` change of an earlier middleware. The model call gets that change and the steer message after it.
- Recovery checks the final answer first. A turn whose final answer is in the log settles `completed`, also when an abort was asked, no attempt is left, or its time limit passed.
- New `durability.interruptedToolResult`. Recovery gives this text to a `replay: 'never'` tool call that a crash cut, as the content and the error of its tool message. Without it, the result is the same as before.
- The `durability.recover` hook can return `{ action: 'run', overrides }`. The recovered turn then runs with these `TurnOverrides` (adapter, reasoning, promptCache, tools). The log does not keep them.
- New `session.recover()` and `host.recover(threadId?)` recover the log again, as `open()` does. A turn that another host held at open runs once its lease expires. The work that the session runs or queues stays as it is, and two calls do not run one input twice.
- The log keeps the model retry count of a turn (a `harness.turn.retry` record). An attempt that recovery runs starts from the stored count, so `turn.onModelError` gets the same `retries` as before the crash. A finished tool phase still sets it back to 0. The recover hook gets it as `input.retries`. An older log without the record works as before.
- New `session.continue(options?)`, `client.continue(options?)`, and the `{ op: 'continue' }` input start a turn from the stored transcript, with no new message. They queue, check the `inputId` for a duplicate, and recover after a restart, as a prompt does. When the transcript does not end with a user or a tool message, the input is rejected with `nothing_to_continue`.
- New `TurnAdditions.ephemeral`. `turn.beforeFinish` (and `turn.onJoin`) can return messages that only the next model call gets, after its context. The transcript and the log never keep them. A `beforeFinish` that returns only ephemeral messages also continues the turn, and counts for `maxFinishCycles`.
- New `session.close({ recoverable: true })` and `host.close({ recoverable: true })`. The running turns and agent runs stop as on a crash: no settlement, no aborted run state, and no later log write. Their leases end at once, so the next host that opens the thread runs them again. A plain `close()` and a user cancel still settle `aborted`.
