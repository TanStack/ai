---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1966](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1966)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1969](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1969)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1971](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1971)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1967](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1967)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1968](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1968)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1970](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1970)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1972](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1972)
