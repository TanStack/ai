---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2552](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2552)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2562](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2562)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2558](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2558)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2554](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2554)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2556](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2556)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2560](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2560)

Token usage information (if available)
