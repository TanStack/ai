---
id: RerankAdapterResult
title: RerankAdapterResult
---

Defined in: [packages/ai/src/types.ts:2297](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2297)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2298](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2298)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:2300](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2300)

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

Defined in: [packages/ai/src/types.ts:2301](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2301)
