---
id: TextCompletionChunk
title: TextCompletionChunk
---

Defined in: [packages/ai/src/types.ts:1742](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1742)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1745](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1745)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1747](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1747)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1743](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1743)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1744](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1744)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1746](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1746)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1748](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1748)
