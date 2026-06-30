---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1700](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1700)

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

Defined in: [packages/ai/src/types.ts:1708](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1708)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1716](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1716)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1704](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1704)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1710](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1710)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1706](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1706)

Text description of the desired audio
