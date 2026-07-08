---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1742](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1742)

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

Defined in: [packages/ai/src/types.ts:1750](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1750)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1758](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1758)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1746](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1746)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1752](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1752)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1748](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1748)

Text description of the desired audio
