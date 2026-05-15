---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1519)

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

Defined in: [packages/typescript/ai/src/types.ts:1527](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1527)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1537](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1537)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1521](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1521)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1531](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1531)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1529](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1529)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1523](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1523)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1525](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1525)

The voice to use for generation
