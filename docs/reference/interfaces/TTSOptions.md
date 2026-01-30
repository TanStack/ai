---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [types.ts:1056](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1056)

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

Defined in: [types.ts:1064](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1064)

The output audio format

***

### model

```ts
model: string;
```

Defined in: [types.ts:1058](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1058)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1068](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1068)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [types.ts:1066](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1066)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [types.ts:1060](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1060)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [types.ts:1062](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1062)

The voice to use for generation
