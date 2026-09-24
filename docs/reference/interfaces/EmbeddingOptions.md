---
id: EmbeddingOptions
title: EmbeddingOptions
---

Defined in: [packages/ai/src/types.ts:2899](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2899)

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

Defined in: [packages/ai/src/types.ts:2908](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2908)

Requested output dimensionality. Adapters for models with fixed
dimensions throw a clear runtime error when this is set.

***

### input

```ts
input: EmbeddingInputItem[];
```

Defined in: [packages/ai/src/types.ts:2903](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2903)

The items to embed — one vector per item

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2916](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2916)

Internal logger threaded from the embed() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2901](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2901)

The model to use for embedding generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2910](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2910)

Model-specific options for embedding generation
