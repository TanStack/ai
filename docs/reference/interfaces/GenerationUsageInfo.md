---
id: GenerationUsageInfo
title: GenerationUsageInfo
---

# Interface: GenerationUsageInfo

Defined in: [packages/ai/src/activities/middleware/types.ts:86](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L86)

Token usage passed to [GenerationMiddleware.onUsage](GenerationMiddleware.md#onusage). Kept as an
interface extending `TokenUsage` to preserve declaration merging for this
publicly exported type.

## Extends

- `TokenUsage`
