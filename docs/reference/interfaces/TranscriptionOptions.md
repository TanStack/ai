---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1350](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1350)

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

Defined in: [packages/typescript/ai/src/types.ts:1356](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1356)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1358](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1358)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1354](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1354)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1364](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1364)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1360](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1360)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/typescript/ai/src/types.ts:1362](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1362)

The format of the transcription output
