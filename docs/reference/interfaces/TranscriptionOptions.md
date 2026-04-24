---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1380](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1380)

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

Defined in: [packages/typescript/ai/src/types.ts:1386](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1386)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1388](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1388)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1400](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1400)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1384](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1384)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1394](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1394)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1390](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1390)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/typescript/ai/src/types.ts:1392](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1392)

The format of the transcription output
