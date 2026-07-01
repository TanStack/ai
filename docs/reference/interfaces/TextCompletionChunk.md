---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1509](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1509)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1512](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1512)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1514](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1514)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1510](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1510)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1511](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1511)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1513](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1513)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1515](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1515)
