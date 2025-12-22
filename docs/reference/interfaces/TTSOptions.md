---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [types.ts:891](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L891)

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

Defined in: [types.ts:899](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L899)

The output audio format

***

### model

```ts
model: string;
```

Defined in: [types.ts:893](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L893)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:903](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L903)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [types.ts:901](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L901)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [types.ts:895](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L895)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [types.ts:897](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L897)

The voice to use for generation
