---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1671](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1671)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1674](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1674)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1676](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1676)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1672](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1672)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1673](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1673)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1675](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1675)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1677](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1677)
