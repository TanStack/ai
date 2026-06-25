---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1628](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1628)

Result of image generation

## Properties

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1630](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1630)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1634](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1634)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1632](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1632)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1636](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1636)

Token usage information (if available)
