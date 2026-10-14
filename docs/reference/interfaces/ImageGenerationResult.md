---
id: ImageGenerationResult
title: ImageGenerationResult
---

Defined in: [packages/ai/src/types.ts:2493](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2493)

Result of image generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2503](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2503)

Persisted artifact references for generated assets, when available

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2495](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2495)

Unique identifier for the generation

***

### images

```ts
images: GeneratedImage[];
```

Defined in: [packages/ai/src/types.ts:2499](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2499)

Array of generated images

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2497](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2497)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2501](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2501)

Token usage information (if available)
