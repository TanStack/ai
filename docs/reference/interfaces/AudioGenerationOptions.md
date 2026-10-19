---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

Defined in: [packages/ai/src/types.ts:2550](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2550)

Options for audio generation (music, sound effects, etc.).
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2572](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2572)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2558](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2558)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2566](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2566)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2554](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2554)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2560](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2560)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2556](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2556)

Text description of the desired audio
