---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1725](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1725)

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

Defined in: [packages/ai/src/types.ts:1731](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1731)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1733](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1733)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1745](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1745)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1729](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1729)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1739](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1739)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/ai/src/types.ts:1735](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1735)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/ai/src/types.ts:1737](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1737)

The format of the transcription output
