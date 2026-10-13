---
id: EmbeddingOptions
title: EmbeddingOptions
---

Defined in: [packages/ai/src/types.ts:3333](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3333)

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

Defined in: [packages/ai/src/types.ts:3342](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3342)

Requested output dimensionality. Adapters for models with fixed
dimensions throw a clear runtime error when this is set.

***

### input

```ts
input: EmbeddingInputItem[];
```

Defined in: [packages/ai/src/types.ts:3337](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3337)

The items to embed — one vector per item

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:3350](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3350)

Internal logger threaded from the embed() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3335](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3335)

The model to use for embedding generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:3344](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3344)

Model-specific options for embedding generation
