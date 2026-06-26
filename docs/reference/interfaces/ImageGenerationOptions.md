---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/ai/src/types.ts:1623](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1623)

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

Defined in: [packages/ai/src/types.ts:1649](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1649)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1628](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1628)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1644](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1644)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/ai/src/types.ts:1640](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1640)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: MediaPrompt;
```

Defined in: [packages/ai/src/types.ts:1638](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1638)

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

Defined in: [packages/ai/src/types.ts:1642](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1642)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
