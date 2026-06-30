---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1862](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1862)

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

Defined in: [packages/ai/src/types.ts:1870](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1870)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1880](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1880)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1864](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1864)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1874](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1874)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/ai/src/types.ts:1872](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1872)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1866](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1866)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/types.ts:1868](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1868)

The voice to use for generation
