---
id: RerankAdapterResult
title: RerankAdapterResult
---

Defined in: [packages/ai/src/types.ts:2291](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2291)

Provider-level rerank result. Adapters return scored indices into the
(serialized) `documents` array plus usage — never the documents themselves.
The activity attaches the original documents.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2292](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2292)

***

### ranking

```ts
ranking: object[];
```

Defined in: [packages/ai/src/types.ts:2294](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2294)

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

Defined in: [packages/ai/src/types.ts:2295](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2295)
