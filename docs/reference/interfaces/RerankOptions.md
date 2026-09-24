---
id: RerankOptions
title: RerankOptions
---

Defined in: [packages/ai/src/types.ts:1861](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1861)

Options passed to a [RerankAdapter](RerankAdapter.md). Documents reach the adapter
already serialized to strings — the `rerank()` activity stringifies object
documents and maps results back to the original elements, so adapters never
deal with the caller's document type.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:1874](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1874)

Forwarded to the provider request for cancellation.

***

### documents

```ts
documents: string[];
```

Defined in: [packages/ai/src/types.ts:1868](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1868)

Documents to rerank, pre-serialized to strings by the activity.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1880](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1880)

Internal logger threaded from the rerank() entry point. Adapters must call
logger.request() before the provider call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1864](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1864)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1872](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1872)

Provider-specific options forwarded by the rerank() activity.

***

### query

```ts
query: string;
```

Defined in: [packages/ai/src/types.ts:1866](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1866)

The search query documents are scored against.

***

### topN?

```ts
optional topN?: number;
```

Defined in: [packages/ai/src/types.ts:1870](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1870)

Return only the top N results. Passed through to the provider.
