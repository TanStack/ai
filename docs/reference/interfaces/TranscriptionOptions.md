---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [types.ts:1131](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1131)

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

Defined in: [types.ts:1137](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1137)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1139](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1139)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### model

```ts
model: string;
```

Defined in: [types.ts:1135](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1135)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1145](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1145)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [types.ts:1141](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1141)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [types.ts:1143](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1143)

The format of the transcription output
