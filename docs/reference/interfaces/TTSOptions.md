---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1634](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1634)

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

Defined in: [packages/ai/src/types.ts:1642](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1642)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1652](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1652)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1636](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1636)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1646](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1646)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/ai/src/types.ts:1644](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1644)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1638](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1638)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/types.ts:1640](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1640)

The voice to use for generation
