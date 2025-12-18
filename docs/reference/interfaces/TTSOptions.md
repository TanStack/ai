---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [types.ts:907](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L907)

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

Defined in: [types.ts:915](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L915)

The output audio format

***

### model

```ts
model: string;
```

Defined in: [types.ts:909](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L909)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:919](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L919)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [types.ts:917](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L917)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [types.ts:911](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L911)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [types.ts:913](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L913)

The voice to use for generation
