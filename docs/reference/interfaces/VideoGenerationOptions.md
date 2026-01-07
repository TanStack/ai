---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions\>

Defined in: [types.ts:847](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L847)

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

Defined in: [types.ts:857](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L857)

**`Experimental`**

Video duration in seconds

***

### model

```ts
model: string;
```

Defined in: [types.ts:851](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L851)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:859](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L859)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:853](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L853)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: string;
```

Defined in: [types.ts:855](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L855)

**`Experimental`**

Video size in WIDTHxHEIGHT format (e.g., "1280x720")
