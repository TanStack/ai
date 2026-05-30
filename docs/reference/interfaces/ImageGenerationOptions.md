---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/ai/src/types.ts:1462](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1462)

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

Defined in: [packages/ai/src/types.ts:1480](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1480)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1467](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1467)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1475](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1475)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/ai/src/types.ts:1471](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1471)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1469](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1469)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/ai/src/types.ts:1473](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1473)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
