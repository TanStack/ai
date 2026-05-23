---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1618](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1618)

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

Defined in: [packages/typescript/ai/src/types.ts:1626](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1626)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1636](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1636)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1620](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1620)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1630](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1630)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1628](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1628)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1622](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1622)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1624](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1624)

The voice to use for generation
