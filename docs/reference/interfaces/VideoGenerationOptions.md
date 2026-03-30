---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions, TSize\>

Defined in: [types.ts:1076](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1076)

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

Defined in: [types.ts:1087](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1087)

**`Experimental`**

Video duration in seconds

***

### model

```ts
model: string;
```

Defined in: [types.ts:1081](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1081)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1089](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1089)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:1083](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1083)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: TSize;
```

Defined in: [types.ts:1085](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1085)

**`Experimental`**

Video size — format depends on the provider (e.g., "16:9", "1280x720")
