---
id: TextCompletionChunk
title: TextCompletionChunk
---

Defined in: [packages/ai/src/types.ts:1932](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1932)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1935](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1935)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1937](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1937)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1933](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1933)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1934](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1934)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1936](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1936)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1938](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1938)
