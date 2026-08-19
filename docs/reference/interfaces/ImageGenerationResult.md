---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:2297](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2297)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2307](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2307)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2299](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2299)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2303](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2303)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2301](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2301)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2305](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2305)

Token usage information (if available)
