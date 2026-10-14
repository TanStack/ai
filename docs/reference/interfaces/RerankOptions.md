---
id: RerankOptions
title: RerankOptions
---

Defined in: [packages/ai/src/types.ts:2228](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2228)

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

Defined in: [packages/ai/src/types.ts:2241](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2241)

Forwarded to the provider request for cancellation.

***

### documents

```ts
documents: string[];
```

Defined in: [packages/ai/src/types.ts:2235](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2235)

Documents to rerank, pre-serialized to strings by the activity.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2247](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2247)

Internal logger threaded from the rerank() entry point. Adapters must call
logger.request() before the provider call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2231](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2231)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2239](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2239)

Provider-specific options forwarded by the rerank() activity.

***

### query

```ts
query: string;
```

Defined in: [packages/ai/src/types.ts:2233](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2233)

The search query documents are scored against.

***

### topN?

```ts
optional topN?: number;
```

Defined in: [packages/ai/src/types.ts:2237](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2237)

Return only the top N results. Passed through to the provider.
