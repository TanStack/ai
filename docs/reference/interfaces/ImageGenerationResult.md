---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: packages/ai/src/types.ts:2451

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: packages/ai/src/types.ts:2461

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: packages/ai/src/types.ts:2453

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: packages/ai/src/types.ts:2457

Array of generated images

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/types.ts:2455

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: packages/ai/src/types.ts:2459

Token usage information (if available)
