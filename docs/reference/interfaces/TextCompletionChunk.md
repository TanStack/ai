---
id: TextCompletionChunk
title: TextCompletionChunk
---

Defined in: [packages/ai/src/types.ts:1818](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1818)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:1821](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1821)

***

### finishReason?

```ts
optional finishReason?: "length" | "stop" | "content_filter" | null;
```

Defined in: [packages/ai/src/types.ts:1823](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1823)

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1819](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1819)

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1820](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1820)

***

### role?

```ts
optional role?: "assistant";
```

Defined in: [packages/ai/src/types.ts:1822](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1822)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1824](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1824)
