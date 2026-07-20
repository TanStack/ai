---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1850](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1850)

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

Defined in: [packages/ai/src/types.ts:1858](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1858)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1866](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1866)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1854](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1854)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1860](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1860)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1856](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1856)

Text description of the desired audio
