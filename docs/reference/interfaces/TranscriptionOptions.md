---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [types.ts:1097](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1097)

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

Defined in: [types.ts:1103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1103)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1105)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### model

```ts
model: string;
```

Defined in: [types.ts:1101](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1101)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1111](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1111)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [types.ts:1107](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1107)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [types.ts:1109](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1109)

The format of the transcription output
