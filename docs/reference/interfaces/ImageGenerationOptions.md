---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/ai/src/types.ts:1476](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1476)

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

Defined in: [packages/ai/src/types.ts:1494](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1494)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1481](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1481)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1489](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1489)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/ai/src/types.ts:1485](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1485)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1483](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1483)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/ai/src/types.ts:1487](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1487)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
