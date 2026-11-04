---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2569](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2569)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2579](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2579)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2575](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2575)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2571](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2571)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2573](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2573)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2577](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2577)

Token usage information (if available)
