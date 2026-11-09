---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: [packages/ai/src/types.ts:2528](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2528)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2538](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2538)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2530](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2530)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2534](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2534)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2532](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2532)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2536](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2536)

Token usage information (if available)
