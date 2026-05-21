---
id: UsageInfo
title: UsageInfo
---

# Interface: UsageInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:267](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L267)

Token usage statistics passed to the onUsage hook.
Extracted from the RUN_FINISHED chunk when usage data is present.

## Properties

### completionTokens

```ts
completionTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:269](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L269)

***

### promptTokens

```ts
promptTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:268](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L268)

***

### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:270](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L270)
