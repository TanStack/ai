---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1933](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1933)

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

Defined in: [packages/ai/src/types.ts:1939](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1939)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:1941](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1941)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1953](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1953)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1937](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1937)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1947](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1947)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/ai/src/types.ts:1943](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1943)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/ai/src/types.ts:1945](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1945)

The format of the transcription output
