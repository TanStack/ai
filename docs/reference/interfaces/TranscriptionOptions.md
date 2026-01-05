---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [types.ts:953](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L953)

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

Defined in: [types.ts:959](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L959)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [types.ts:961](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L961)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### model

```ts
model: string;
```

Defined in: [types.ts:957](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L957)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:967](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L967)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [types.ts:963](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L963)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [types.ts:965](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L965)

The format of the transcription output
