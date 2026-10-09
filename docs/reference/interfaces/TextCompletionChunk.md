---
id: TextCompletionChunk
title: TextCompletionChunk
---

Defined in: [packages/ai/src/types.ts:1953](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1953)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1956](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1956)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1958](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1958)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1954](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1954)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1955](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1955)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1957](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1957)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1959](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1959)
