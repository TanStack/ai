---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1436](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1436)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1439](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1439)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1441)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1437)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1438)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1440)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1442)
