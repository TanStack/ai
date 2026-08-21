---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:2302](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2302)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2312](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2312)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2304](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2304)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2308](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2308)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2306](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2306)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2310](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2310)

Token usage information (if available)
