---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1647](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1647)

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

Defined in: [packages/ai/src/types.ts:1655](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1655)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1663](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1663)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1651](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1651)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1657](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1657)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1653](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1653)

Text description of the desired audio
