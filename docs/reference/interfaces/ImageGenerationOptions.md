---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [types.ts:1020](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1020)

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

Defined in: [types.ts:1025](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1025)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1033](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1033)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [types.ts:1029](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1029)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:1027](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1027)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [types.ts:1031](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1031)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
