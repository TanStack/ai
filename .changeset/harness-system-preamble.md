---
'@tanstack/ai-harness': minor
---

Add an additive `systemPreamble` to the `prompt` input op. When present, its
strings are prepended (ahead of the harness's own `systemPrompts`) as
system/developer messages for that one run — a place for a trigger to attach
per-run context (e.g. operational memory) without the agent author doing
anything.

Also make the server-tool execution `context` always carry the live `threadId`
and `runId` (merged over the harness's static `context`) so a tool invoked
in-band (from a model turn) can resolve the calling thread, matching the flat
`{ threadId, runId, signal }` already passed to out-of-band `{ op: 'tool' }`
invocations.

Generated with Claude Code.
