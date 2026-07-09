---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/ai/src/types.ts:1782](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1782)

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

Defined in: [packages/ai/src/types.ts:1808](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1808)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1787](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1787)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1803](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1803)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/ai/src/types.ts:1799](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1799)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: MediaPrompt;
```

Defined in: [packages/ai/src/types.ts:1797](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1797)

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

Defined in: [packages/ai/src/types.ts:1801](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1801)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
