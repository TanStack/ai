---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2125](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2125)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2135](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2135)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2131](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2131)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2127](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2127)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2129](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2129)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2133](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2133)

Token usage information (if available)
