---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [types.ts:1118](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1118)

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

Defined in: [types.ts:1126](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1126)

The output audio format

***

### model

```ts
model: string;
```

Defined in: [types.ts:1120](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1120)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1130](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1130)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [types.ts:1128](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1128)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [types.ts:1122](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1122)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [types.ts:1124](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1124)

The voice to use for generation
