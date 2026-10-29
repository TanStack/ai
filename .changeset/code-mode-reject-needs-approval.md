---
'@tanstack/ai-code-mode': patch
---

Reject approval-gated tools in Code Mode. A tool marked `needsApproval: true` expects a human approval interrupt before it runs, but Code Mode invokes tools from inside the sandbox — the model only ever sees the outer `execute_typescript` call, so no per-tool interrupt is raised and the tool would run unattended.

The `CodeModeTool` type already pins `needsApproval` to `false`, so typed callers were blocked at compile time. This adds the matching runtime guard for callers that bypass the types (JavaScript consumers, `as` casts, or dynamically built tools):

- `createCodeModeTool` / `createCodeMode` now throw synchronously if any supplied tool has `needsApproval: true`, naming every offending tool.
- `toolToBinding` / `toolsToBindings` enforce the same rule as a lower-level backstop, so every binding path is covered.

Approving only the outer `execute_typescript` call would not preserve per-tool/per-argument approval semantics, so these tools are rejected rather than silently approved. Remove approval-gated tools from the Code Mode config, or drop `needsApproval` if they are safe to call unattended.
