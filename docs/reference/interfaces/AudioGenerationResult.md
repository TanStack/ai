---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:2103](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2103)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2113](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2113)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2109](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2109)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2105](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2105)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2107](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2107)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2111](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2111)

Token usage information (if available)
