---
id: TTSOptions
title: TTSOptions
---

# Interface: TTSOptions\<TProviderOptions\>

Defined in: [types.ts:912](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L912)

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

Defined in: [types.ts:920](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L920)

The output audio format

***

### model

```ts
model: string;
```

Defined in: [types.ts:914](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L914)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:924](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L924)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed: number;
```

Defined in: [types.ts:922](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L922)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [types.ts:916](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L916)

The text to convert to speech

***

### voice?

```ts
optional voice: string;
```

Defined in: [types.ts:918](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L918)

The voice to use for generation
