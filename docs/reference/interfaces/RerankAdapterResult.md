---
id: RerankAdapterResult
title: RerankAdapterResult
---

# Interface: RerankAdapterResult

Defined in: [packages/ai/src/types.ts:2060](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2060)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2061](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2061)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:2063](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2063)

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

Defined in: [packages/ai/src/types.ts:2064](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2064)
