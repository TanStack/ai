---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [types.ts:932](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L932)

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

Defined in: [types.ts:938](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L938)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:940](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L940)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### model

```ts
model: string;
```

Defined in: [types.ts:936](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L936)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:946](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L946)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [types.ts:942](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L942)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [types.ts:944](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L944)

The format of the transcription output
