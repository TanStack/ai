---
'@tanstack/ai': minor
'@tanstack/ai-persistence': patch
---

A subagent can now return a plain value and call any activity. `defineAgent`'s `run` can return a promise of any value, such as an image result. The value arrives on `SUBAGENT_FINISHED.result`, and the parent model gets it as the tool result. A very long string in that result (for example a base64 image) reaches the parent model as a short note. `run` also gets the activities on `ctx` (`ctx.chat`, `ctx.generateImage`, `ctx.generateVideo`, and the rest), which fill in the thread id, a run id, and the abort signal, plus `ctx.forward` for a plain `chat()` call. The optional `produces` field says what an agent makes. `RunRecord` gets optional fields for harness sessions (`kind`, `activity`, `agent`, `result`, `artifacts`, `principal`, `leaseOwner`, `leaseExpiresAt`, `checkpoint`), and the memory run stores keep them.
