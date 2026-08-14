---
id: RerankAdapterResult
title: RerankAdapterResult
---

# Interface: RerankAdapterResult

Defined in: [packages/ai/src/types.ts:2052](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2052)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2053](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2053)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:2055](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2055)

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

Defined in: [packages/ai/src/types.ts:2056](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2056)
