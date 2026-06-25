---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1669](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1669)

Options for audio generation (music, sound effects, etc.).
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1677](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1677)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1685](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1685)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1673](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1673)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1679](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1679)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1675](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1675)

Text description of the desired audio
