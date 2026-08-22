---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:2026](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2026)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2036](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2036)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2028](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2028)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2032](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2032)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2030](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2030)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2034](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2034)

Token usage information (if available)
