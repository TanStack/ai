---
id: EmbeddingOptions
title: EmbeddingOptions
---

Defined in: [packages/ai/src/types.ts:3373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3373)

Options for embedding generation, as received by adapters. The `embed()`
entry point normalizes a single input item to an array before calling the
adapter, so `input` is always an array here.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:3396](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3396)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### dimensions?

```ts
optional dimensions?: number;
```

Defined in: [packages/ai/src/types.ts:3382](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3382)

Requested output dimensionality. Adapters for models with fixed
dimensions throw a clear runtime error when this is set.

***

### input

```ts
input: EmbeddingInputItem[];
```

Defined in: [packages/ai/src/types.ts:3377](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3377)

The items to embed — one vector per item

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:3390](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3390)

Internal logger threaded from the embed() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch
blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3375](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3375)

The model to use for embedding generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:3384](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3384)

Model-specific options for embedding generation
