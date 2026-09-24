---
id: TextCompletionChunk
title: TextCompletionChunk
---

Defined in: [packages/ai/src/types.ts:1802](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1802)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1805](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1805)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1807](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1807)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1803](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1803)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1804](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1804)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1806](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1806)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1808](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1808)
