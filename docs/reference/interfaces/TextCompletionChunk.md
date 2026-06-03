---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1429)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1432](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1432)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1434](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1434)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1430](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1430)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1431](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1431)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1433](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1433)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1435](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1435)
