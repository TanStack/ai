---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1911](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1911)

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

Defined in: [packages/ai/src/types.ts:1917](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1917)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1919](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1919)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1931](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1931)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1915](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1915)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1925](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1925)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/ai/src/types.ts:1921](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1921)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/ai/src/types.ts:1923](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1923)

The format of the transcription output
