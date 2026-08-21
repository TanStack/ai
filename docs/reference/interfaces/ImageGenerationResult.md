---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:2310](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2310)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2320](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2320)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2312](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2312)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2316](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2316)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2314](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2314)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2318](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2318)

Token usage information (if available)
