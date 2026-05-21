---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/typescript/ai/src/types.ts:1416](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1416)

Options for image generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

### TSize

`TSize` *extends* `string` \| `undefined` = `string`

## Properties

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/typescript/ai/src/types.ts:1434](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1434)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1421](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1421)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/typescript/ai/src/types.ts:1429](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1429)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1425](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1425)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1423](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1423)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/typescript/ai/src/types.ts:1427](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1427)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
