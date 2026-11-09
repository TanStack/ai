---
'@tanstack/ai': minor
'@tanstack/ai-compaction': minor
'@tanstack/ai-anthropic': minor
---

`withCompaction({ native })` now passes the tools, the model options, and the reasoning of the chat call into `compact`. The Anthropic text adapter implements `compact` as an on-demand Messages request (`compaction: { type: "summarize" }`, beta `compact-2026-09-04`). The signed compaction block stays on the assistant message and goes back on later requests to the same model. A result with no signed block uses the configured strategy.
