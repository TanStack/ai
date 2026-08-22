---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1702](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1702)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1705](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1705)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1707](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1707)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1703](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1703)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1704](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1704)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1706](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1706)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1708](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1708)
