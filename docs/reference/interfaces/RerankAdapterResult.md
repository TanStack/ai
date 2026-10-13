---
id: RerankAdapterResult
title: RerankAdapterResult
---

Defined in: [packages/ai/src/types.ts:2039](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2039)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2040](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2040)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:2042](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2042)

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

Defined in: [packages/ai/src/types.ts:2043](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2043)
