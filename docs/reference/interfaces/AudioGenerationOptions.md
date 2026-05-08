---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/typescript/ai/src/types.ts:1279](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1279)

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

Defined in: [packages/typescript/ai/src/types.ts:1287](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1287)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1295](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1295)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1283](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1283)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1289](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1289)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1285](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1285)

Text description of the desired audio
