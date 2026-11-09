---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: [packages/ai/src/types.ts:2602](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2602)

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2612](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2612)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:2608](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2608)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2604](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2604)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2606](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2606)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2610](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2610)

Token usage information (if available)
