---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions\>

Defined in: [types.ts:968](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L968)

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

Defined in: [types.ts:972](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L972)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:980](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L980)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [types.ts:976](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L976)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:974](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L974)

Text description of the desired image(s)

***

### size?

```ts
optional size: string;
```

Defined in: [types.ts:978](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L978)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
