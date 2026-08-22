---
id: RerankAdapterResult
title: RerankAdapterResult
---

# Interface: RerankAdapterResult

Defined in: [packages/ai/src/types.ts:2072](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2072)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2073](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2073)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:2075](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2075)

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

Defined in: [packages/ai/src/types.ts:2076](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2076)
