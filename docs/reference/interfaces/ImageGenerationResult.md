---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1650](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1650)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1652](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1652)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1656](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1656)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1654](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1654)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1658](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1658)

Token usage information (if available)
