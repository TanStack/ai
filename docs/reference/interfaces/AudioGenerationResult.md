---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2588](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2588)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2598](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2598)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2594](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2594)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2590](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2590)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2592](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2592)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2596](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2596)

Token usage information (if available)
