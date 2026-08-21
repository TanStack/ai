---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1978](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1978)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1981](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1981)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1983](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1983)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1979](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1979)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1980](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1980)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1982](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1982)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1984](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1984)
