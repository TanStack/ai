---
id: TranscriptionOptions
title: TranscriptionOptions
---

Defined in: [packages/ai/src/types.ts:2944](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2944)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2970](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2970)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### audio

```ts
audio: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:2950](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2950)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2952](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2952)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2964](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2964)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2948](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2948)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2958](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2958)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:2954](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2954)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat?: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2956](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2956)

The format of the transcription output
