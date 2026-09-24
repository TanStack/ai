---
id: RerankAdapterResult
title: RerankAdapterResult
---

Defined in: [packages/ai/src/types.ts:1828](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1828)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1829](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1829)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:1831](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1831)

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

Defined in: [packages/ai/src/types.ts:1832](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1832)
