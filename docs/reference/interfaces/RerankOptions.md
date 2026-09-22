---
id: RerankOptions
title: RerankOptions
---

Defined in: [packages/ai/src/types.ts:1801](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1801)

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

Defined in: [packages/ai/src/types.ts:1814](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1814)

Forwarded to the provider request for cancellation.

***

### documents

```ts
documents: string[];
```

Defined in: [packages/ai/src/types.ts:1808](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1808)

Documents to rerank, pre-serialized to strings by the activity.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1820](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1820)

Internal logger threaded from the rerank() entry point. Adapters must call
logger.request() before the provider call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1804](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1804)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1812](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1812)

Provider-specific options forwarded by the rerank() activity.

***

### query

```ts
query: string;
```

Defined in: [packages/ai/src/types.ts:1806](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1806)

The search query documents are scored against.

***

### topN?

```ts
optional topN?: number;
```

Defined in: [packages/ai/src/types.ts:1810](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1810)

Return only the top N results. Passed through to the provider.
