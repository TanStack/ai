---
id: TextCompletionChunk
title: TextCompletionChunk
---

Defined in: [packages/ai/src/types.ts:2211](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2211)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:2214](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2214)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:2216](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2216)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2212](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2212)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2213](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2213)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:2215](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2215)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2217](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2217)
