---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/ai/src/types.ts:1649](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1649)

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

Defined in: [packages/ai/src/types.ts:1660](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1660)

**`Experimental`**

Video duration in seconds

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:1667](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1667)

**`Experimental`**

Internal logger threaded from the generateVideo() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1654](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1654)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1662](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1662)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1656](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1656)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/ai/src/types.ts:1658](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1658)

**`Experimental`**

Video size — format depends on the provider (e.g., "16:9", "1280x720")
