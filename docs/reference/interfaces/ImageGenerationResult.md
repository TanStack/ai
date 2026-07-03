---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1723](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1723)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1725](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1725)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1729](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1729)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1727](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1727)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1731](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1731)

Token usage information (if available)
