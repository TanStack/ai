---
id: VideoGenerationOptions
title: VideoGenerationOptions
---

# Interface: VideoGenerationOptions\<TProviderOptions\>

Defined in: [types.ts:1023](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1023)

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

Defined in: [types.ts:1033](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1033)

**`Experimental`**

Video duration in seconds

***

### model

```ts
model: string;
```

Defined in: [types.ts:1027](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1027)

**`Experimental`**

The model to use for video generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [types.ts:1035](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1035)

**`Experimental`**

Model-specific options for video generation

***

### prompt

```ts
prompt: string;
```

Defined in: [types.ts:1029](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1029)

**`Experimental`**

Text description of the desired video

***

### size?

```ts
optional size: string;
```

Defined in: [types.ts:1031](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1031)

**`Experimental`**

Video size in WIDTHxHEIGHT format (e.g., "1280x720")
