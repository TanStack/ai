---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1639](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1639)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1642](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1642)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1644](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1644)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1640](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1640)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1641](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1641)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1643](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1643)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1645](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1645)
