---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1884](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1884)

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

Defined in: [packages/ai/src/types.ts:1892](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1892)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1902](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1902)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1886](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1886)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1896](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1896)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/ai/src/types.ts:1894](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1894)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1888](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1888)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/types.ts:1890](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1890)

The voice to use for generation
