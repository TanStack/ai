---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [types.ts:968](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L968)

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

Defined in: [types.ts:973](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L973)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:981](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L981)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [types.ts:977](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L977)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:975](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L975)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [types.ts:979](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L979)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
