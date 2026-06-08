---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1669](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1669)

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

Defined in: [packages/ai/src/types.ts:1677](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1677)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1687](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1687)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1671](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1671)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1681](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1681)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/ai/src/types.ts:1679](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1679)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1673](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1673)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/types.ts:1675](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1675)

The voice to use for generation
