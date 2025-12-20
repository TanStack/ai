---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions\>

Defined in: [types.ts:826](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L826)

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

Defined in: [types.ts:836](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L836)

**`Experimental`**

Video duration in seconds

***

### model

```ts
model: string;
```

Defined in: [types.ts:830](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L830)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:838](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L838)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:832](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L832)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: string;
```

Defined in: [types.ts:834](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L834)

**`Experimental`**

Video size in WIDTHxHEIGHT format (e.g., "1280x720")
