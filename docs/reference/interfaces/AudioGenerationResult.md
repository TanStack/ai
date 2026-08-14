---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:2348](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2348)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2358](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2358)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2354](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2354)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2350](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2350)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2352](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2352)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2356](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2356)

Token usage information (if available)
