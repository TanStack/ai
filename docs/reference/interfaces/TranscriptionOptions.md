---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1767](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1767)

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

Defined in: [packages/ai/src/types.ts:1773](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1773)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1775](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1775)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1787](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1787)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1771](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1771)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1781](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1781)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/ai/src/types.ts:1777](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1777)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/ai/src/types.ts:1779](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1779)

The format of the transcription output
