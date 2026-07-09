---
id: ImageGenerationResult
title: ImageGenerationResult
---

# Interface: ImageGenerationResult

Defined in: [packages/ai/src/types.ts:1870](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1870)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:1880](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1880)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1872](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1872)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:1876](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1876)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1874](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1874)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1878](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1878)

Token usage information (if available)
