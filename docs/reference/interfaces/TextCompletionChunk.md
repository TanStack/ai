---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1464](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1464)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1467](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1467)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1469](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1469)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1465](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1465)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1466](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1466)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1468](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1468)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1470](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1470)
