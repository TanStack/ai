---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1597](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1597)

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

Defined in: [packages/typescript/ai/src/types.ts:1603](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1603)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1605](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1605)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1617](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1617)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1601](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1601)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1611](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1611)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1607](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1607)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/typescript/ai/src/types.ts:1609](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1609)

The format of the transcription output
