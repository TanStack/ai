---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1655](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1655)

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

Defined in: [packages/typescript/ai/src/types.ts:1661](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1661)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1663](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1663)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1675](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1675)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1659](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1659)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1669](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1669)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1665](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1665)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat: "text" | "json" | "srt" | "verbose_json" | "vtt";
```

Defined in: [packages/typescript/ai/src/types.ts:1667](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1667)

The format of the transcription output
