---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1679](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1679)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1685](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1685)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1681](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1681)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1683](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1683)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1687](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1687)

Token usage information (if available)
