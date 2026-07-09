---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2095](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2095)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### audio

```ts
audio: string | File | Blob | ArrayBuffer;
```

Defined in: [packages/ai/src/types.ts:2101](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2101)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:2103](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2103)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2115](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2115)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2099](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2099)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2109](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2109)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/ai/src/types.ts:2105](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2105)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2107](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2107)

The format of the transcription output
