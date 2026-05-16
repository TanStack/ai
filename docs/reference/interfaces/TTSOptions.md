---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1550](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1550)

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

Defined in: [packages/typescript/ai/src/types.ts:1558](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1558)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1568](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1568)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1552](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1552)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1562](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1562)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1560](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1560)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1554](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1554)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1556](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1556)

The voice to use for generation
