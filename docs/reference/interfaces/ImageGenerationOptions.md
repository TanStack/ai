---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [types.ts:1013](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1013)

Options for image generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` = `string`

## Properties

### model

```ts
model: string;
```

Defined in: [types.ts:1018](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1018)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1026](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1026)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [types.ts:1022](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1022)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:1020](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1020)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [types.ts:1024](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1024)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
