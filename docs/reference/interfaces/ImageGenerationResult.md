---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1831](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1831)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1833](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1833)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1837](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1837)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1835](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1835)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1839](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1839)

Token usage information (if available)
