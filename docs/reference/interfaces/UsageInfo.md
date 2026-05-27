---
id: UsageInfo
title: UsageInfo
---

# Interface: UsageInfo

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:268](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L268)

Token usage statistics passed to the onUsage hook.
Extracted from the RUN_FINISHED chunk when usage data is present.

## Properties

### completionTokens

```ts
completionTokens: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:270](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L270)

***

### promptTokens

```ts
promptTokens: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:269](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L269)

***

### totalTokens

```ts
totalTokens: number;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:271](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L271)
