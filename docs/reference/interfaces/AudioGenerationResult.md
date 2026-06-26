---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1701](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1701)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1707](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1707)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1703](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1703)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1705](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1705)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1709](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1709)

Token usage information (if available)
