---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1891](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1891)

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

Defined in: [packages/ai/src/types.ts:1899](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1899)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1907](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1907)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1895](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1895)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1901](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1901)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1897](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1897)

Text description of the desired audio
