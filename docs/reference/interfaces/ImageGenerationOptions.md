---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions\>

Defined in: [types.ts:936](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L936)

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

Defined in: [types.ts:940](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L940)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:948](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L948)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [types.ts:944](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L944)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:942](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L942)

Text description of the desired image(s)

***

### size?

```ts
optional size: string;
```

Defined in: [types.ts:946](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L946)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
