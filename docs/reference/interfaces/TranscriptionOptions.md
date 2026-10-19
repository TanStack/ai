---
id: TranscriptionOptions
title: TranscriptionOptions
---

Defined in: [packages/ai/src/types.ts:3217](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3217)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:3243](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3243)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### audio

```ts
audio: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:3223](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3223)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3225](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3225)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:3237](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3237)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3221](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3221)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:3231](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3231)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:3227](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3227)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat?: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:3229](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3229)

The format of the transcription output
