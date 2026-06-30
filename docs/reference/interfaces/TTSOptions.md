---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1842](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1842)

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

Defined in: [packages/ai/src/types.ts:1850](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1850)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1860](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1860)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1844](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1844)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1854](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1854)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/ai/src/types.ts:1852](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1852)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1846](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1846)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/types.ts:1848](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1848)

The voice to use for generation
