---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1838](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1838)

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

Defined in: [packages/ai/src/types.ts:1844](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1844)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1846](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1846)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1858](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1858)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1842](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1842)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1852](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1852)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/ai/src/types.ts:1848](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1848)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/ai/src/types.ts:1850](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1850)

The format of the transcription output
