---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: [packages/ai/src/types.ts:2256](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2256)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2266](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2266)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2258](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2258)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2262](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2262)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2260](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2260)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2264](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2264)

Token usage information (if available)
