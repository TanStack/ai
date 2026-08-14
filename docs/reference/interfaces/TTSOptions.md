---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2474](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2474)

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

Defined in: [packages/ai/src/types.ts:2498](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2498)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### format?

```ts
optional format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
```

Defined in: [packages/ai/src/types.ts:2482](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2482)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2492](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2492)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2476](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2476)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2486](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2486)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed?: number;
```

Defined in: [packages/ai/src/types.ts:2484](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2484)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2478](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2478)

The text to convert to speech

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2480](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2480)

The voice to use for generation
