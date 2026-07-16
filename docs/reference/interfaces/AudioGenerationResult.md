---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1882](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1882)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1888](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1888)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1884](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1884)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1886](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1886)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1890](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1890)

Token usage information (if available)
