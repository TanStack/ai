---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1546](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1546)

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

Defined in: [packages/ai/src/types.ts:1554](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1554)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1562](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1562)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1550](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1550)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1556](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1556)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1552](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1552)

Text description of the desired audio
