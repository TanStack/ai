---
'@tanstack/ai-harness': minor
---

A session can now go back to any earlier message. `session.revert(messageId)` hides the later messages in the transcript, and `session.unrevert()` brings them back. With `snapshots()`, the files that the later tool calls changed go back too. The next prompt drops the hidden messages for good. The session saves the revert in the log, or in `stores.metadata` on a host without a log, so a restart keeps it.

Clients send the new `revert` and `unrevert` inputs with `client.revert(messageId)` and `client.unrevert()`. The harness must list `'undo'` in `expose.commands`. A `harness.revert` event tells views to read the transcript again. Each `tanstack/snapshots:step` record now has the `toolCallIds` of its step.
