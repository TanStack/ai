---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1974](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1974)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1977](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1977)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1979](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1979)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1975](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1975)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1976](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1976)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1978](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1978)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1980](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1980)
