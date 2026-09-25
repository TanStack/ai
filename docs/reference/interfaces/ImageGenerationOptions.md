---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2034](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2034)

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

Defined in: [packages/ai/src/types.ts:2066](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2066)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2060](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2060)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2039](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2039)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2055](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2055)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages?: number;
```

Defined in: [packages/ai/src/types.ts:2051](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2051)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: MediaPrompt;
```

Defined in: [packages/ai/src/types.ts:2049](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2049)

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

Defined in: [packages/ai/src/types.ts:2053](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2053)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
