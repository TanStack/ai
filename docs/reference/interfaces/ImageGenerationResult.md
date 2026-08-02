---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1863](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1863)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1865](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1865)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1869](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1869)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1867](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1867)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1871](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1871)

Token usage information (if available)
