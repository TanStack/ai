---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [types.ts:1183](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1183)

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

Defined in: [types.ts:1189](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1189)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1191](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1191)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### model

```ts
model: string;
```

Defined in: [types.ts:1187](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1187)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1197](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1197)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [types.ts:1193](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1193)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [types.ts:1195](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1195)

The format of the transcription output
