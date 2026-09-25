---
id: RerankAdapterResult
title: RerankAdapterResult
---

Defined in: [packages/ai/src/types.ts:1904](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1904)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1905](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1905)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:1907](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1907)

Scored results, highest relevance first, as indices into `documents`.

#### index

```ts
index: number;
```

#### score

```ts
score: number;
```

***

### usage

```ts
usage: TokenUsage;
```

Defined in: [packages/ai/src/types.ts:1908](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1908)
