---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: [packages/ai/src/types.ts:2529](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2529)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2539](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2539)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2531](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2531)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2535](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2535)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2533](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2533)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2537](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2537)

Token usage information (if available)
