---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:1592](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1592)

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

Defined in: [packages/ai/src/types.ts:1600](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1600)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1608](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1608)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1596](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1596)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1602](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1602)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1598](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1598)

Text description of the desired audio
