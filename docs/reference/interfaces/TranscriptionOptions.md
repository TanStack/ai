---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2039](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2039)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### audio

```ts
audio: string | File | Blob | ArrayBuffer;
```

Defined in: [packages/ai/src/types.ts:2045](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2045)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:2047](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2047)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2059](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2059)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2043](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2043)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2053](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2053)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/ai/src/types.ts:2049](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2049)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2051](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2051)

The format of the transcription output
