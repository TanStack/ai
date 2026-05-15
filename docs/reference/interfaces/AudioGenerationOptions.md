---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1391](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1391)

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

Defined in: [packages/typescript/ai/src/types.ts:1399](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1399)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1407](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1407)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1395](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1395)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1401](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1401)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1397](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1397)

Text description of the desired audio
