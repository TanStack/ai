---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: [packages/ai/src/types.ts:2126](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2126)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2136](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2136)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2128](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2128)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2132](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2132)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2130](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2130)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2134](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2134)

Token usage information (if available)
