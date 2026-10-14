---
id: TextCompletionChunk
title: TextCompletionChunk
---

Defined in: [packages/ai/src/types.ts:2169](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2169)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:2172](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2172)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:2174](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2174)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2170](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2170)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2171](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2171)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:2173](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2173)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2175](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2175)
