---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1681](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1681)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1683](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1683)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1687](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1687)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1685](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1685)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1689](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1689)

Token usage information (if available)
