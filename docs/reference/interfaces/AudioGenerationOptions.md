---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1422](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1422)

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

Defined in: [packages/typescript/ai/src/types.ts:1430](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1430)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1438](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1438)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1426](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1426)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1432](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1432)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1428](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1428)

Text description of the desired audio
