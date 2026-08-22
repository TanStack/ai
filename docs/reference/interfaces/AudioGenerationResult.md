---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:2085](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2085)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2095](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2095)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2091](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2091)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2087](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2087)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2089](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2089)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2093](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2093)

Token usage information (if available)
