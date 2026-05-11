---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1214](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1214)

Options for image generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` = `string`

## Properties

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1232](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1232)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1219](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1219)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1227](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1227)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1223](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1223)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1221](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1221)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1225](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1225)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
