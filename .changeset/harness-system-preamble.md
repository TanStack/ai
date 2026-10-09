---
'@tanstack/ai-harness': minor
---

`session.prompt(message, { systemPreamble })` adds system prompts for that one turn, ahead of the harness prompts, for example memory that the host adds. Only server code can set it. A client `prompt` input cannot, and the log does not keep it, as with `overrides`.

A plain-object tool `context` also gets the live `threadId` and `runId`, so a tool can find the thread and the run that called it.
