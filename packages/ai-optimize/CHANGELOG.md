# @tanstack/ai-optimize

## 0.1.0

### Minor Changes

- [#2148](https://github.com/TanStack/ai/pull/2148) [`f25954a`](https://github.com/TanStack/ai/commit/f25954a2867ceacaad11c0a5995ba742e2201934) - Add optimization-driven, deterministic tool-result context projection.
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

### Patch Changes

- Updated dependencies [[`e5bb4d5`](https://github.com/TanStack/ai/commit/e5bb4d5e666663664321ea2d3c6cf06176c3d942), [`f25954a`](https://github.com/TanStack/ai/commit/f25954a2867ceacaad11c0a5995ba742e2201934), [`c695ada`](https://github.com/TanStack/ai/commit/c695ada5091e7022bf13b235220645ceb65d43b0)]:
  - @tanstack/ai@1.9.0
