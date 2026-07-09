---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2037](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2037)

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

Defined in: [packages/ai/src/types.ts:2045](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2045)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2055](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2055)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2039](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2039)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2049](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2049)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/ai/src/types.ts:2047](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2047)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2041](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2041)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/types.ts:2043](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2043)

The voice to use for generation
