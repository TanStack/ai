---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1243](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1243)

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

Defined in: [packages/typescript/ai/src/types.ts:1254](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1254)

**`Experimental`**

Video duration in seconds

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1248](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1248)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1256](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1256)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1250](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1250)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1252](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1252)

**`Experimental`**

Video size — format depends on the provider (e.g., "16:9", "1280x720")
