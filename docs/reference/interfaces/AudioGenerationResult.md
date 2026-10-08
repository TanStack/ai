---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2315](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2315)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2325](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2325)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2321](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2321)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2317](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2317)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2319](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2319)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2323](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2323)

Token usage information (if available)
