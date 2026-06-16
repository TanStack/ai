---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1676](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1676)

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

Defined in: [packages/ai/src/types.ts:1684](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1684)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1694](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1694)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1678](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1678)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1688](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1688)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/ai/src/types.ts:1686](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1686)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1680](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1680)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/types.ts:1682](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1682)

The voice to use for generation
