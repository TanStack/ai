---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [types.ts:1090](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1090)

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

Defined in: [types.ts:1098](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1098)

The output audio format

***

### model

```ts
model: string;
```

Defined in: [types.ts:1092](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1092)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1102](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1102)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [types.ts:1100](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1100)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [types.ts:1094](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1094)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [types.ts:1096](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1096)

The voice to use for generation
