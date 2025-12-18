---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions\>

Defined in: [types.ts:787](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L787)

Options for image generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### model

```ts
model: string;
```

Defined in: [types.ts:791](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L791)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:799](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L799)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [types.ts:795](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L795)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:793](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L793)

Text description of the desired image(s)

***

### size?

```ts
optional size: string;
```

Defined in: [types.ts:797](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L797)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
