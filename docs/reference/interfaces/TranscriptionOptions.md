---
id: TranscriptionOptions
title: TranscriptionOptions
---

Defined in: [packages/ai/src/types.ts:2421](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2421)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2447](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2447)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### audio

```ts
audio: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:2427](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2427)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2429)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2441)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2425](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2425)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2435](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2435)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:2431](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2431)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat?: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2433](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2433)

The format of the transcription output
