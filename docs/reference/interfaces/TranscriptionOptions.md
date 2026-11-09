---
id: TranscriptionOptions
title: TranscriptionOptions
---

Defined in: [packages/ai/src/types.ts:3206](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3206)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:3232](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3232)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### audio

```ts
audio: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:3212](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3212)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3214](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3214)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:3226](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3226)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3210](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3210)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:3220](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3220)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:3216](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3216)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat?: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:3218](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3218)

The format of the transcription output
