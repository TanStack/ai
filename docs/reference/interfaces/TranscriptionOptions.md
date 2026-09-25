---
id: TranscriptionOptions
title: TranscriptionOptions
---

Defined in: [packages/ai/src/types.ts:2810](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2810)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2836](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2836)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### audio

```ts
audio: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:2816](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2816)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2818](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2818)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2830](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2830)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2814](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2814)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2824](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2824)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:2820](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2820)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat?: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2822](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2822)

The format of the transcription output
