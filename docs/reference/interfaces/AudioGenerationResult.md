---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2201](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2201)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2211](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2211)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2207](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2207)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2203](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2203)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2205](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2205)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2209](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2209)

Token usage information (if available)
