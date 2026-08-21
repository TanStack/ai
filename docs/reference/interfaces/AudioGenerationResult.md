---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:2361](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2361)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2371](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2371)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2367](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2367)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2363](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2363)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2365](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2365)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2369](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2369)

Token usage information (if available)
