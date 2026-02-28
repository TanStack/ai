---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [types.ts:1159](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1159)

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

Defined in: [types.ts:1165](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1165)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1167](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1167)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### model

```ts
model: string;
```

Defined in: [types.ts:1163](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1163)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1173](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1173)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [types.ts:1169](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1169)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [types.ts:1171](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1171)

The format of the transcription output
