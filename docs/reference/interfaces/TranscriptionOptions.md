---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2048](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2048)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### audio

```ts
audio: string | File | Blob | ArrayBuffer;
```

Defined in: [packages/ai/src/types.ts:2054](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2054)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:2056](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2056)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2068](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2068)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2052](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2052)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2062](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2062)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/ai/src/types.ts:2058](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2058)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2060](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2060)

The format of the transcription output
