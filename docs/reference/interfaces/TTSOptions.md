---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1992](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1992)

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

Defined in: [packages/ai/src/types.ts:2000](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2000)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2010](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2010)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1994](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1994)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2004](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2004)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/ai/src/types.ts:2002](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2002)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:1996](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1996)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/ai/src/types.ts:1998](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1998)

The voice to use for generation
