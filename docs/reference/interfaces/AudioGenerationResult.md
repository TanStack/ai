---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1923](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1923)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:1933](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1933)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1929](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1929)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1925](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1925)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1927](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1927)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1931](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1931)

Token usage information (if available)
