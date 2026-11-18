---
id: TextCompletionChunk
title: TextCompletionChunk
---

Defined in: [packages/ai/src/types.ts:2220](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2220)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:2223](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2223)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:2225](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2225)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2221](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2221)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2222](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2222)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:2224](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2224)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2226](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2226)
