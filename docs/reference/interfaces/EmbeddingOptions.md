---
id: EmbeddingOptions
title: EmbeddingOptions
---

Defined in: [packages/ai/src/types.ts:2573](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2573)

Options for embedding generation, as received by adapters. The `embed()`
entry point normalizes a single input item to an array before calling the
adapter, so `input` is always an array here.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### dimensions?

```ts
optional dimensions?: number;
```

Defined in: [packages/ai/src/types.ts:2582](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2582)

Requested output dimensionality. Adapters for models with fixed
dimensions throw a clear runtime error when this is set.

***

### input

```ts
input: EmbeddingInputItem[];
```

Defined in: [packages/ai/src/types.ts:2577](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2577)

The items to embed — one vector per item

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2590](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2590)

Internal logger threaded from the embed() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2575](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2575)

The model to use for embedding generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2584](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2584)

Model-specific options for embedding generation
