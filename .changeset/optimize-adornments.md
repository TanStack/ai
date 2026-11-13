---
'@tanstack/ai-optimize': minor
'@tanstack/ai': minor
---

Add optimization-driven, deterministic tool-result context projection.

- `@tanstack/ai` gains a `context` field (`ToolContextPolicy`) on tool
  definitions plus the `FieldProjection` type and its combinators
  (`truncateHead`, `truncateTail`, `truncateHeadTail`, `dropWithRef`,
  `aboveTokens`). `FieldProjection` is branded, so a projection is always built
  with a combinator, never a bare object. The core reads nothing from it (same
  posture as `replay`); behavior lives in the new package.
- New package `@tanstack/ai-optimize`: a `chat()` middleware that truncates only
  **optimized** tool-result (and `optimize()`-declared argument) fields in the
  model projection, never in the canonical messages, event stream, or UI.
  Deterministic strategies only, a run-scoped stash, an injected
  `retrieve_context` tool, and an `optimize()` wrapper for foreign/MCP tool
  sets. The combinators are re-exported here too.
