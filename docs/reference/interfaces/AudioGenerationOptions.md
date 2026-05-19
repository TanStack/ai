---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1480](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1480)

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

Defined in: [packages/typescript/ai/src/types.ts:1488](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1488)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1496](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1496)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1484](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1484)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1490](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1490)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1486](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1486)

Text description of the desired audio
