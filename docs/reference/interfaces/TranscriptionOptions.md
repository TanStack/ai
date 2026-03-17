---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [types.ts:1176](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1176)

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

Defined in: [types.ts:1182](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1182)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:1184](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1184)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### model

```ts
model: string;
```

Defined in: [types.ts:1180](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1180)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1190](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1190)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [types.ts:1186](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1186)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [types.ts:1188](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1188)

The format of the transcription output
