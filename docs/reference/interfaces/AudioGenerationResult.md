---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2587](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2587)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2597](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2597)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2593](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2593)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2589](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2589)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2591](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2591)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2595](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2595)

Token usage information (if available)
