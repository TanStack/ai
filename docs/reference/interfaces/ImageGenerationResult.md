---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1527](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1527)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1529](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1529)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1533](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1533)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1531](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1531)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1535](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1535)

Token usage information (if available)
