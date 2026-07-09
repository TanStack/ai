---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1648](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1648)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1651](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1651)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1653](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1653)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1649](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1649)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1650](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1650)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1652](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1652)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1654](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1654)
