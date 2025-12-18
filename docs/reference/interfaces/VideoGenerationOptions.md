---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions\>

Defined in: [types.ts:842](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L842)

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

Defined in: [types.ts:852](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L852)

**`Experimental`**

Video duration in seconds

***

### model

```ts
model: string;
```

Defined in: [types.ts:846](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L846)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:854](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L854)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:848](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L848)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: string;
```

Defined in: [types.ts:850](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L850)

**`Experimental`**

Video size in WIDTHxHEIGHT format (e.g., "1280x720")
