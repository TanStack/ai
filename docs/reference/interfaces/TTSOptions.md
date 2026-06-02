---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1698](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1698)

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

Defined in: [packages/ai/src/types.ts:1706](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1706)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1716](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1716)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1700](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1700)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1710](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1710)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/ai/src/types.ts:1708](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1708)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1702](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1702)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/types.ts:1704](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1704)

The voice to use for generation
