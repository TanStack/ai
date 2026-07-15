---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1822](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1822)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1824](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1824)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1828](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1828)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1826](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1826)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1830](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1830)

Token usage information (if available)
