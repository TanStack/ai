---
id: RerankAdapterResult
title: RerankAdapterResult
---

Defined in: [packages/ai/src/types.ts:1888](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1888)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1889](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1889)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:1891](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1891)

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

Defined in: [packages/ai/src/types.ts:1892](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1892)
