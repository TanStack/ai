---
id: AudioGenerationOptions
title: AudioGenerationOptions
---

# Interface: AudioGenerationOptions\<TProviderOptions\>

Defined in: [packages/ai/src/types.ts:2065](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2065)

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

Defined in: [packages/ai/src/types.ts:2087](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2087)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2073](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2073)

Desired duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2081](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2081)

Internal logger threaded from the generateAudio() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2069](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2069)

The model to use for audio generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2075](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2075)

Model-specific options for audio generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2071](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2071)

Text description of the desired audio
