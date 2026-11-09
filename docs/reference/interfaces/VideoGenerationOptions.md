---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2608](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2608)

Options for video generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` \| `undefined` = `string`

### TDuration

`TDuration` *extends* `string` \| `number` \| `undefined` = `number`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2645](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2645)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### duration?

```ts
optional duration?: TDuration;
```

Defined in: [packages/ai/src/types.ts:2632](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2632)

Video duration. Adapters that declare a per-model duration map narrow
this to that model's union (a number, `"8"`, or `"8s"`). Use
`adapter.snapDuration(input)` to coerce a raw value. `input` may be
seconds, a `"6s"` template, or `"auto"` when the model lists it.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2639](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2639)

Internal logger threaded from the generateVideo() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2614](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2614)

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2634](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2634)

Model-specific options for video generation

***

### prompt

```ts
prompt: MediaPrompt;
```

Defined in: [packages/ai/src/types.ts:2623](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2623)

Description of the desired video: a plain string, or an ordered array of
content parts for image-conditioned generation. Image parts may carry
`metadata.role` (`'start_frame' | 'end_frame' | 'reference' |
'character'`) to disambiguate intent; adapters route them onto the
provider-native request (e.g. OpenAI Sora `input_reference`, fal
`image_url` / `end_image_url`) and throw at runtime if unsupported.

***

### size?

```ts
optional size?: TSize;
```

Defined in: [packages/ai/src/types.ts:2625](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2625)

Video size — format depends on the provider (e.g., "16:9", "1280x720")
