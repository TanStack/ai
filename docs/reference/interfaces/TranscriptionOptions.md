---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1891](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1891)

Options for audio transcription.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### audio

```ts
audio: string | File | Blob | ArrayBuffer;
```

Defined in: [packages/ai/src/types.ts:1897](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1897)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1899](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1899)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1911](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1911)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1895](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1895)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1905](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1905)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/ai/src/types.ts:1901](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1901)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/ai/src/types.ts:1903](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1903)

The format of the transcription output
