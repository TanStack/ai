---
id: RerankAdapterResult
title: RerankAdapterResult
---

Defined in: [packages/ai/src/types.ts:2273](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2273)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2274](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2274)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:2276](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2276)

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

Defined in: [packages/ai/src/types.ts:2277](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2277)
