---
id: UsageInfo
title: UsageInfo
---

# Interface: UsageInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:227](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L227)

Token usage statistics passed to the onUsage hook.
Extracted from the RUN_FINISHED chunk when usage data is present.

## Properties

### completionTokens

```ts
completionTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:229](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L229)

***

### promptTokens

```ts
promptTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:228](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L228)

***

### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:230](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L230)
