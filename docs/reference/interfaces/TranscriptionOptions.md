---
id: TranscriptionOptions
title: TranscriptionOptions
---

Defined in: [packages/ai/src/types.ts:2665](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2665)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2691](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2691)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### audio

```ts
audio: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:2671](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2671)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2673](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2673)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2685](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2685)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2669](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2669)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2679](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2679)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:2675](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2675)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat?: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2677](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2677)

The format of the transcription output
