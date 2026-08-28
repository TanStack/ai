---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:2044](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2044)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2054](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2054)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2046](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2046)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2050](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2050)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2048](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2048)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2052](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2052)

Token usage information (if available)
