---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1397](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1397)

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

Defined in: [packages/typescript/ai/src/types.ts:1415](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1415)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1402](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1402)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1410](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1410)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1406](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1406)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1404](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1404)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1408](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1408)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
