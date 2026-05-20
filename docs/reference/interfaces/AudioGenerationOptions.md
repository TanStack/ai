---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1485](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1485)

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

Defined in: [packages/typescript/ai/src/types.ts:1493](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1493)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1501](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1501)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1489](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1489)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1495](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1495)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1491](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1491)

Text description of the desired audio
