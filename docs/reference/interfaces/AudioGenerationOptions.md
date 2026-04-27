---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1274](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1274)

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

Defined in: [packages/typescript/ai/src/types.ts:1282](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1282)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1290](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1290)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1278](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1278)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1284](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1284)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1280](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1280)

Text description of the desired audio
