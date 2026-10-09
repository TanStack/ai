---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2336](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2336)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2346](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2346)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2342](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2342)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2338](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2338)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2340](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2340)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2344](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2344)

Token usage information (if available)
