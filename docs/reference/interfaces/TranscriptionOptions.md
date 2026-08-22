---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2275](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2275)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2301](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2301)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### audio

```ts
audio: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:2281](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2281)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2283](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2283)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2295](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2295)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2279](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2279)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2289](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2289)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:2285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2285)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat?: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2287)

The format of the transcription output
