---
id: ImageGenerationOptions
title: ImageGenerationOptions
---

# Interface: ImageGenerationOptions\<TProviderOptions, TSize\>

Defined in: [packages/ai/src/types.ts:1505](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1505)

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

Defined in: [packages/ai/src/types.ts:1523](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1523)

Internal logger threaded from the generateImage() entry point. Adapters must
call logger.request() before the SDK call and logger.errors() in catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1510](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1510)

The model to use for image generation

***

### modelOptions?

```ts
optional modelOptions: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:1518](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1518)

Model-specific options for image generation

***

### numberOfImages?

```ts
optional numberOfImages: number;
```

Defined in: [packages/ai/src/types.ts:1514](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1514)

Number of images to generate (default: 1)

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:1512](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1512)

Text description of the desired image(s)

***

### size?

```ts
optional size: TSize;
```

Defined in: [packages/ai/src/types.ts:1516](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1516)

Image size in WIDTHxHEIGHT format (e.g., "1024x1024")
