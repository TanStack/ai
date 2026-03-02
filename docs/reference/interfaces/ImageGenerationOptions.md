---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [types.ts:996](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L996)

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

Defined in: [types.ts:1001](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1001)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1009](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1009)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [types.ts:1005](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1005)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:1003](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1003)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [types.ts:1007](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1007)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
