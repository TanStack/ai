---
id: AudioGenerationResult
title: AudioGenerationResult
---

Defined in: packages/ai/src/types.ts:2511

Result of audio generation

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: packages/ai/src/types.ts:2521

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: GeneratedAudio;
```

Defined in: packages/ai/src/types.ts:2517

The generated audio

***

### id

```ts
id: string;
```

Defined in: packages/ai/src/types.ts:2513

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/types.ts:2515

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: packages/ai/src/types.ts:2519

Token usage information (if available)
