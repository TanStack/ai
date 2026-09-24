---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: [packages/ai/src/types.ts:2066](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2066)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2076](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2076)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2068](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2068)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2072](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2072)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2070](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2070)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2074](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2074)

Token usage information (if available)
