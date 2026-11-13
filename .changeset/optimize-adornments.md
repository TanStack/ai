---
'@tanstack/ai-optimize': minor
'@tanstack/ai': minor
---

Add adornment-driven, deterministic tool-result context projection.

- `@tanstack/ai` gains a `context` field (`ToolContextPolicy`) on tool
  definitions plus `FieldProjection` / `TruncateStrategy` types. The core reads
  nothing from it (same posture as `replay`); behavior lives in the new package.
- New package `@tanstack/ai-optimize`: a `chat()` middleware that truncates only
  **adorned** tool-result (and `optimize()`-declared argument) fields in the
  model projection, never in the canonical messages, event stream, or UI.
  Deterministic strategies (`head`, `tail`, `head_tail`, `drop_with_ref`), a
  run-scoped stash, an injected `retrieve_context` tool, and an `optimize()`
  wrapper for foreign/MCP tool sets.
