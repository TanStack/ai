---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1527](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1527)

**`Experimental`**

Options for video generation.
These are the common options supported across providers.

 Video generation is an experimental feature and may change.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` \| `undefined` = `string`

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1538](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1538)

**`Experimental`**

Video duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1545](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1545)

**`Experimental`**

Internal logger threaded from the generateVideo() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1532](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1532)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1540](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1540)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1534](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1534)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1536](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1536)

**`Experimental`**

Video size — format depends on the provider (e.g., "16:9", "1280x720")
