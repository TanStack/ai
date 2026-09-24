---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2185](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2185)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2195](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2195)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2191](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2191)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2187](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2187)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2189](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2189)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2193](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2193)

Token usage information (if available)
