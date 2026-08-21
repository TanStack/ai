---
id: TranscriptionOptions
title: TranscriptionOptions
---

# Interface: TranscriptionOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2551](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2551)

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2577](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2577)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### audio

```ts
audio: string | ArrayBuffer | File | Blob;
```

Defined in: [packages/ai/src/types.ts:2557](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2557)

The audio data to transcribe - can be base64 string, File, Blob, or Buffer

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2559](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2559)

The language of the audio in ISO-639-1 format (e.g., 'en')

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2571](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2571)

Internal logger threaded from the generateTranscription() entry point.
Adapters must call logger.request() before the SDK call and logger.errors()
in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2555](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2555)

The model to use for transcription

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2565](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2565)

Model-specific options for transcription

***

### prompt?

```ts
optional prompt?: string;
```

Defined in: [packages/ai/src/types.ts:2561](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2561)

An optional prompt to guide the transcription

***

### responseFormat?

```ts
optional responseFormat?: TranscriptionResponseFormat;
```

Defined in: [packages/ai/src/types.ts:2563](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2563)

The format of the transcription output
