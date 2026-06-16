---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/ai/src/types.ts:1477](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1477)

Options for image generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` \| `undefined` = `string`

## Properties

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1495](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1495)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1482](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1482)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1490](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1490)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/ai/src/types.ts:1486](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1486)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1484](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1484)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/ai/src/types.ts:1488](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1488)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
