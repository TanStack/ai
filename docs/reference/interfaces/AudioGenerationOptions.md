---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1720](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1720)

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

Defined in: [packages/ai/src/types.ts:1728](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1728)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1736](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1736)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1724](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1724)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1730](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1730)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1726](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1726)

Text description of the desired audio
