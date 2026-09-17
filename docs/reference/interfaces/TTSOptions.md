---
id: TTSOptions
title: TTSOptions
---

Defined in: [packages/ai/src/types.ts:2357](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2357)

Options for text-to-speech generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2381](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2381)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### format?

```ts
optional format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
```

Defined in: [packages/ai/src/types.ts:2365](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2365)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2375](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2375)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2359](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2359)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2369](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2369)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed?: number;
```

Defined in: [packages/ai/src/types.ts:2367](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2367)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2361](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2361)

The text to convert to speech

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2363](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2363)

The voice to use for generation
