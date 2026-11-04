---
'@tanstack/ai-mcp': patch
---

`createMCPServer` now answers `tasks/cancel` for an `execution: 'task'` tool on spec 2025. The task status becomes `cancelled`, `ctx.abortSignal` of the tool aborts, and a late result does not replace the cancel. A spec 2025 `elicitation/create` that the server cancels now also stops the question in the harness.
