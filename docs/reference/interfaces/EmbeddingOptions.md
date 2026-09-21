---
id: EmbeddingOptions
title: EmbeddingOptions
---

Defined in: [packages/ai/src/types.ts:2817](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2817)

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

Defined in: [packages/ai/src/types.ts:2826](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2826)

Requested output dimensionality. Adapters for models with fixed
dimensions throw a clear runtime error when this is set.

***

### input

```ts
input: EmbeddingInputItem[];
```

Defined in: [packages/ai/src/types.ts:2821](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2821)

The items to embed — one vector per item

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2834](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2834)

Internal logger threaded from the embed() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2819](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2819)

The model to use for embedding generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2828](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2828)

Model-specific options for embedding generation
