---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1983](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1983)

Options for text-to-speech generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### format?

```ts
optional format: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
```

Defined in: [packages/ai/src/types.ts:1991](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1991)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2001](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2001)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1985](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1985)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1995](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1995)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/ai/src/types.ts:1993](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1993)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1987](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1987)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/types.ts:1989](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1989)

The voice to use for generation
