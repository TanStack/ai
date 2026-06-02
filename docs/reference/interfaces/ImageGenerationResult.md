---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1555](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1555)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1557](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1557)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1561](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1561)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1559](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1559)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1563](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1563)

Token usage information (if available)
