---
id: UsageInfo
title: UsageInfo
---

# Interface: UsageInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:238](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L238)

Token usage statistics passed to the onUsage hook.
Extracted from the RUN_FINISHED chunk when usage data is present.

## Properties

### completionTokens

```ts
completionTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:240](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L240)

***

### promptTokens

```ts
promptTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:239](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L239)

***

### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:241](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L241)
