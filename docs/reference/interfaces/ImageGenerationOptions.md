---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2385](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2385)

Options for image generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` \| `undefined` = `string`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2417](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2417)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2411](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2411)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2390](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2390)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2406](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2406)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages?: number;
```

Defined in: [packages/ai/src/types.ts:2402](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2402)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: MediaPrompt;
```

Defined in: [packages/ai/src/types.ts:2400](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2400)

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
optional size?: TSize;
```

Defined in: [packages/ai/src/types.ts:2404](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2404)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
