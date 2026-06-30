---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1489](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1489)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1492](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1492)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1494](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1494)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1490](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1490)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1491](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1491)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1493](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1493)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1495](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1495)
