---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2080](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2080)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### audio

```ts
audio: string | File | Blob | ArrayBuffer;
```

Defined in: [packages/ai/src/types.ts:2086](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2086)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:2088](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2088)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2100](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2100)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2084](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2084)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2094](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2094)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/ai/src/types.ts:2090](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2090)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2092](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2092)

The format of the transcription output
