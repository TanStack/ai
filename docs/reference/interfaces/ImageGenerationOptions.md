---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1318](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1318)

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

Defined in: [packages/typescript/ai/src/types.ts:1336](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1336)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1323](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1323)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1331](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1331)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1327](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1327)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1325](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1325)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1329](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1329)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
