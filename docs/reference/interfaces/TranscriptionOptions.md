---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2293](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2293)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2319](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2319)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### audio

```ts
audio: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:2299](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2299)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2301](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2301)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2313](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2313)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2297](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2297)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2307](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2307)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:2303](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2303)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat?: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2305](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2305)

The format of the transcription output
