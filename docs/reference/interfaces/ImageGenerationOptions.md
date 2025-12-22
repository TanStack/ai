---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions\>

Defined in: [types.ts:792](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L792)

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

Defined in: [types.ts:796](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L796)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:804](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L804)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [types.ts:800](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L800)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:798](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L798)

Text description of the desired image(s)

***

### size?

```ts
optional size: string;
```

Defined in: [types.ts:802](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L802)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
