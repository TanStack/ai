---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:2356](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2356)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2366](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2366)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2362](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2362)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2358](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2358)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2360](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2360)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2364](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2364)

Token usage information (if available)
