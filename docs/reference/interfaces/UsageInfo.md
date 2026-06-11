---
id: UsageInfo
title: UsageInfo
---

# Interface: UsageInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:270](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L270)

Token usage statistics passed to the onUsage hook.
Extracted from the RUN_FINISHED chunk when usage data is present.

Includes optional provider-reported `cost`/`costDetails` (see TokenUsage).
Kept as an interface extending `TokenUsage` to preserve declaration merging for
this publicly exported type.

## Extends

- `TokenUsage`
