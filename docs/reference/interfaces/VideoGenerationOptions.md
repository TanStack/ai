---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions, TSize, TDuration\>

Defined in: [packages/ai/src/types.ts:1795](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1795)

**`Experimental`**

Options for video generation.
These are the common options supported across providers.

 Video generation is an experimental feature and may change.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` \| `undefined` = `string`

### TDuration

`TDuration` *extends* `string` \| `number` \| `undefined` = `number`

## Properties

### duration?

```ts
optional duration: TDuration;
```

Defined in: [packages/ai/src/types.ts:1818](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1818)

**`Experimental`**

Video duration in seconds. Adapters that declare a per-model duration
map narrow this to the model's valid union; use
`adapter.snapDuration(seconds)` to coerce raw seconds to a valid value.

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1825](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1825)

**`Experimental`**

Internal logger threaded from the generateVideo() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1801](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1801)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1820](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1820)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: MediaPrompt;
```

Defined in: [packages/ai/src/types.ts:1810](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1810)

**`Experimental`**

Description of the desired video: a plain string, or an ordered array of
content parts for image-conditioned generation. Image parts may carry
`metadata.role` (`'start_frame' | 'end_frame' | 'reference' |
'character'`) to disambiguate intent; adapters route them onto the
provider-native request (e.g. OpenAI Sora `input_reference`, fal
`image_url` / `end_image_url`) and throw at runtime if unsupported.

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/ai/src/types.ts:1812](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1812)

**`Experimental`**

Video size — format depends on the provider (e.g., "16:9", "1280x720")
