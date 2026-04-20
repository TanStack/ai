---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1187](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1187)

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

Defined in: [packages/typescript/ai/src/types.ts:1192](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1192)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1200](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1200)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1196](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1196)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1194](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1194)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1198](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1198)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
