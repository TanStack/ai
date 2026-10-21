---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: [packages/ai/src/types.ts:2535](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2535)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2545](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2545)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2537](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2537)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2541](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2541)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2539](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2539)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2543)

Token usage information (if available)
