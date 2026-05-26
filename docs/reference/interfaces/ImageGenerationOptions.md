---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/ai/src/types.ts:1433](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1433)

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

Defined in: [packages/ai/src/types.ts:1451](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1451)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1438)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1446](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1446)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/ai/src/types.ts:1442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1442)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1440)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/ai/src/types.ts:1444](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1444)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
