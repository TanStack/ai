---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/ai/src/types.ts:1592](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1592)

Options for image generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` \| `undefined` = `string`

## Properties

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1618](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1618)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1597](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1597)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1613](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1613)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/ai/src/types.ts:1609](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1609)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: MediaPrompt;
```

Defined in: [packages/ai/src/types.ts:1607](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1607)

Description of the desired image(s): a plain string, or an ordered array
of content parts for image-conditioned generation (image-to-image,
reference-guided, edit, multi-reference). Media parts may carry
`metadata.role` to disambiguate intent (mask, control, reference, …).
Adapters map parts onto the provider-native request — e.g. Gemini
multimodal `contents`, OpenAI `images.edit()`, fal `image_url` /
`mask_url` — and throw a clear runtime error for unsupported modalities.

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/ai/src/types.ts:1611](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1611)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
