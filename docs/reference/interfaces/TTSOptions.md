---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [types.ts:1142](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1142)

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

Defined in: [types.ts:1150](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1150)

The output audio format

***

### model

```ts
model: string;
```

Defined in: [types.ts:1144](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1144)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1154](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1154)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [types.ts:1152](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1152)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [types.ts:1146](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1146)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [types.ts:1148](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1148)

The voice to use for generation
