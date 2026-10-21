---
id: RerankOptions
title: RerankOptions
---

Defined in: packages/ai/src/types.ts:2187

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

Defined in: packages/ai/src/types.ts:2200

Forwarded to the provider request for cancellation.

***

### documents

```ts
documents: string[];
```

Defined in: packages/ai/src/types.ts:2194

Documents to rerank, pre-serialized to strings by the activity.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: packages/ai/src/types.ts:2206

Internal logger threaded from the rerank() entry point. Adapters must call
logger.request() before the provider call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/types.ts:2190

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: packages/ai/src/types.ts:2198

Provider-specific options forwarded by the rerank() activity.

***

### query

```ts
query: string;
```

Defined in: packages/ai/src/types.ts:2192

The search query documents are scored against.

***

### topN?

```ts
optional topN?: number;
```

Defined in: packages/ai/src/types.ts:2196

Return only the top N results. Passed through to the provider.
