---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1262](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1262)

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

Defined in: [packages/typescript/ai/src/types.ts:1273](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1273)

**`Experimental`**

Video duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1280](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1280)

**`Experimental`**

Internal logger threaded from the generateVideo() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1267](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1267)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1275](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1275)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1269](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1269)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1271](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1271)

**`Experimental`**

Video size — format depends on the provider (e.g., "16:9", "1280x720")
