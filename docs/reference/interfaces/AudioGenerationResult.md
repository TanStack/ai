---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2594](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2594)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2604](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2604)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2600](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2600)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2596](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2596)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2598](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2598)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2602](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2602)

Token usage information (if available)
