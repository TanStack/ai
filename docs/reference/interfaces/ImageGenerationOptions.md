---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1206](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1206)

Options for image generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` = `string`

## Properties

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1224](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1224)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1211](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1211)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1219](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1219)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1215](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1215)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1213](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1213)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1217](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1217)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
