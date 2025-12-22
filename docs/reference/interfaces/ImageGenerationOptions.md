---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions\>

Defined in: [types.ts:771](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L771)

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

Defined in: [types.ts:775](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L775)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:783](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L783)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [types.ts:779](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L779)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:777](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L777)

Text description of the desired image(s)

***

### size?

```ts
optional size: string;
```

Defined in: [types.ts:781](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L781)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
