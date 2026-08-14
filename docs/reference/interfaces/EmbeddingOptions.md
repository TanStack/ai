---
id: EmbeddingOptions
title: EmbeddingOptions
---

# Interface: EmbeddingOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2690](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2690)

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

Defined in: [packages/ai/src/types.ts:2699](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2699)

Requested output dimensionality. Adapters for models with fixed
dimensions throw a clear runtime error when this is set.

***

### input

```ts
input: EmbeddingInputItem[];
```

Defined in: [packages/ai/src/types.ts:2694](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2694)

The items to embed — one vector per item

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2707](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2707)

Internal logger threaded from the embed() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2692](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2692)

The model to use for embedding generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2701](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2701)

Model-specific options for embedding generation
