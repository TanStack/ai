---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1752](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1752)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1758](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1758)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1754](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1754)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1756](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1756)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1760](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1760)

Token usage information (if available)
