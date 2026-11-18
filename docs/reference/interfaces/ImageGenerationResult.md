---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: [packages/ai/src/types.ts:2543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2543)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2553](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2553)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2545](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2545)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2549](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2549)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2547](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2547)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2551](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2551)

Token usage information (if available)
