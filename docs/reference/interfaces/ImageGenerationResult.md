---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: [packages/ai/src/types.ts:2277](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2277)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2287)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2279](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2279)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2283](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2283)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2281](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2281)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2285)

Token usage information (if available)
