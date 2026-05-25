---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1417](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1417)

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

Defined in: [packages/typescript/ai/src/types.ts:1435](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1435)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1422](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1422)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1430](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1430)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1426](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1426)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1424](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1424)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1428](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1428)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
