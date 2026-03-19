---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [types.ts:1135](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1135)

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

Defined in: [types.ts:1143](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1143)

The output audio format

***

### model

```ts
model: string;
```

Defined in: [types.ts:1137](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1137)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1147](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1147)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [types.ts:1145](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1145)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [types.ts:1139](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1139)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [types.ts:1141](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1141)

The voice to use for generation
