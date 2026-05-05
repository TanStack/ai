---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1402](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1402)

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

Defined in: [packages/typescript/ai/src/types.ts:1410](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1410)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1420](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1420)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1404](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1404)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1414](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1414)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1412](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1412)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1406](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1406)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1408](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1408)

The voice to use for generation
