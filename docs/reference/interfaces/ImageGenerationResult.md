---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1520](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1520)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1522](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1522)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1526](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1526)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1524](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1524)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1528](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1528)

Token usage information (if available)
