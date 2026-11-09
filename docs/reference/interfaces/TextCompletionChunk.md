---
id: TextCompletionChunk
title: TextCompletionChunk
---

Defined in: [packages/ai/src/types.ts:2205](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2205)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:2208](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2208)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:2210](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2210)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2206](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2206)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2207](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2207)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:2209](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2209)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2211](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2211)
