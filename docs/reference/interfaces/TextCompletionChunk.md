---
id: TextCompletionChunk
title: TextCompletionChunk
---

Defined in: [packages/ai/src/types.ts:2187](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2187)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:2190](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2190)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:2192](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2192)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2188](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2188)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2189](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2189)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:2191](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2191)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2193](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2193)
