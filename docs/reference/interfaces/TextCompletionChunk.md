---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1531](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1531)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1534](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1534)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1536](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1536)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1532](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1532)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1533](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1533)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1535](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1535)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1537](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1537)
