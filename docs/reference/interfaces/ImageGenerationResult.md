---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: [packages/ai/src/types.ts:2142](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2142)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2152](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2152)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2144](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2144)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2148](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2148)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2146](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2146)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2150](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2150)

Token usage information (if available)
