---
id: TextCompletionChunk
title: TextCompletionChunk
---

# Interface: TextCompletionChunk

Defined in: [packages/ai/src/types.ts:1986](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1986)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1989](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1989)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1991](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1991)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1987](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1987)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1988](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1988)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1990](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1990)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1992](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1992)
