---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1720](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1720)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1723](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1723)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1725](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1725)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1721](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1721)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1722](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1722)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1724](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1724)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1726](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1726)
