---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1333](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1333)

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

Defined in: [packages/typescript/ai/src/types.ts:1341](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1341)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1351](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1351)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1335](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1335)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1345](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1345)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1343](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1343)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1337](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1337)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1339](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1339)

The voice to use for generation
