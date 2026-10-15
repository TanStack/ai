---
'@tanstack/ai': minor
'@tanstack/ai-persistence': patch
---

A subagent can now return a plain value and call any activity.

- `defineAgent`'s `run` can return a promise of any value, such as an image result. The value arrives on `SUBAGENT_FINISHED.result`, and the parent model gets it as the tool result. A very long string inside an object result (for example a base64 image) reaches the parent model as a short note (`compactForModel`). A string result also streams as the child's text. The result of `ctx.chat({ stream: false })` streams like the chat stream.
- `run` gets the activities on `ctx` (`ctx.chat`, `ctx.generateImage`, `ctx.generateVideo`, and the rest), which fill in the thread id, a run id, and the abort signal. `ctx.forward` holds the fields for a plain `chat()` call. The optional `produces` field says what an agent makes.
- A host can set `subagents.binding` (`SubagentBinding`) to add chat and generation middleware to every activity call of a child. A child's `ctx.chat({ subagents })` passes it down to its own children.
- Children inherit the prompt cache retention of the parent call.
- The chat middleware context has `subagentName` and `parentSubagentRunId`. `chat()` takes both as options.
- `RunRecord` gets optional fields for host sessions (`kind`, `activity`, `agent`, `result`, `artifacts`, `principal`, `leaseOwner`, `leaseExpiresAt`, `checkpoint`). The memory run stores keep them.
