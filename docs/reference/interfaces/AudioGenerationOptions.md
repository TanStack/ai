---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1535](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1535)

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

Defined in: [packages/ai/src/types.ts:1543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1543)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1551](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1551)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1539](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1539)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1545](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1545)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1541](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1541)

Text description of the desired audio
