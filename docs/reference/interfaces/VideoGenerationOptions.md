---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions\>

Defined in: [types.ts:991](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L991)

**`Experimental`**

Options for video generation.
These are the common options supported across providers.

 Video generation is an experimental feature and may change.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1001](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1001)

**`Experimental`**

Video duration in seconds

***

### model

```ts
model: string;
```

Defined in: [types.ts:995](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L995)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1003](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1003)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:997](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L997)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: string;
```

Defined in: [types.ts:999](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L999)

**`Experimental`**

Video size in WIDTHxHEIGHT format (e.g., "1280x720")
