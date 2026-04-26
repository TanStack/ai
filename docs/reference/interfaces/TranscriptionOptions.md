---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1449](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1449)

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

Defined in: [packages/typescript/ai/src/types.ts:1455](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1455)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1457](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1457)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1469](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1469)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1453](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1453)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1463](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1463)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1459](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1459)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/typescript/ai/src/types.ts:1461](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1461)

The format of the transcription output
