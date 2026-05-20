---
id: UsageInfo
title: UsageInfo
---

# Interface: UsageInfo

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:261](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L261)

Token usage statistics passed to the onUsage hook.
Extracted from the RUN_FINISHED chunk when usage data is present.

## Properties

### completionTokens

```ts
completionTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:263](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L263)

***

### promptTokens

```ts
promptTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:262](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L262)

***

### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:264](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L264)
