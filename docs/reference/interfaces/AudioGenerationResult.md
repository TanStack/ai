---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:2369](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2369)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2379](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2379)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2375](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2375)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2371](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2371)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2373)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2377](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2377)

Token usage information (if available)
