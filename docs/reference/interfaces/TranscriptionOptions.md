---
id: TranscriptionOptions
title: TranscriptionOptions
---

Defined in: [packages/ai/src/types.ts:3181](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3181)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:3207](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3207)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### audio

```ts
audio: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:3187](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3187)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3189](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3189)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:3201](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3201)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3185](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3185)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:3195](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3195)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:3191](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3191)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat?: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:3193](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3193)

The format of the transcription output
