---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1344](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1344)

**`Experimental`**

Options for video generation.
These are the common options supported across providers.

 Video generation is an experimental feature and may change.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` = `string`

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1355](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1355)

**`Experimental`**

Video duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1362](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1362)

**`Experimental`**

Internal logger threaded from the generateVideo() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1349](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1349)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1357](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1357)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1351](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1351)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1353](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1353)

**`Experimental`**

Video size — format depends on the provider (e.g., "16:9", "1280x720")
