---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1458](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1458)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1461](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1461)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1463](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1463)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1459](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1459)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1460](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1460)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1462](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1462)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1464](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1464)
