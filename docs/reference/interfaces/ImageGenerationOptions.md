---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2420](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2420)

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

Defined in: [packages/ai/src/types.ts:2452](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2452)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2446](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2446)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2425](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2425)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2441)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages?: number;
```

Defined in: [packages/ai/src/types.ts:2437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2437)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: MediaPrompt;
```

Defined in: [packages/ai/src/types.ts:2435](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2435)

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

Defined in: [packages/ai/src/types.ts:2439](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2439)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
