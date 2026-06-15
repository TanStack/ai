---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1526](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1526)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1528](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1528)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1532](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1532)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1530](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1530)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1534](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1534)

Token usage information (if available)
