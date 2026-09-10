---
id: RerankAdapterResult
title: RerankAdapterResult
---

# Interface: RerankAdapterResult

Defined in: [packages/ai/src/types.ts:1806](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1806)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1807](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1807)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:1809](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1809)

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

Defined in: [packages/ai/src/types.ts:1810](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1810)
