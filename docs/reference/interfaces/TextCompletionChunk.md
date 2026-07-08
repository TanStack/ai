---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1630](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1630)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1633](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1633)

***

### finishReason?

```ts
optional finishReason: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1635](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1635)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1631](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1631)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1632](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1632)

***

### role?

```ts
optional role: "assistant";
```

Defined in: [packages/ai/src/types.ts:1634](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1634)

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1636](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1636)
