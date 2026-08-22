---
id: RerankOptions
title: RerankOptions
---

# Interface: RerankOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1761](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1761)

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

Defined in: [packages/ai/src/types.ts:1774](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1774)

Forwarded to the provider request for cancellation.

***

### documents

```ts
documents: string[];
```

Defined in: [packages/ai/src/types.ts:1768](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1768)

Documents to rerank, pre-serialized to strings by the activity.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1780](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1780)

Internal logger threaded from the rerank() entry point. Adapters must call
logger.request() before the provider call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1764](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1764)

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1772](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1772)

Provider-specific options forwarded by the rerank() activity.

***

### query

```ts
query: string;
```

Defined in: [packages/ai/src/types.ts:1766](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1766)

The search query documents are scored against.

***

### topN?

```ts
optional topN?: number;
```

Defined in: [packages/ai/src/types.ts:1770](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1770)

Return only the top N results. Passed through to the provider.
