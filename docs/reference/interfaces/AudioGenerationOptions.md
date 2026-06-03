---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1539](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1539)

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

Defined in: [packages/ai/src/types.ts:1547](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1547)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1555](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1555)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1543)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1549](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1549)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1545](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1545)

Text description of the desired audio
