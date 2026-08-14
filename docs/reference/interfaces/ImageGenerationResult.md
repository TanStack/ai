---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:2289](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2289)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2299](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2299)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2291](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2291)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2295](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2295)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2293](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2293)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2297](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2297)

Token usage information (if available)
