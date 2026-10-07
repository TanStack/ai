---
'@tanstack/ai-harness': minor
'@tanstack/ai': minor
---

A user can move a running tool call to the background. Send the `background` input or call `session.background(toolCallId?)`. The call returns at once, and the job keeps running. When the job ends, the model gets its result as a note, and an idle session wakes. `bash` and the single `subagent` tool support it. A client needs no `expose` entry for it.

The tool context has a new optional `detach` field. A tool passes its work to `detach` and races the two promises to support the move.
