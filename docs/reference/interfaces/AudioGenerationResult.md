---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1578](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1578)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1584](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1584)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1580](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1580)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1582](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1582)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1586](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1586)

Token usage information (if available)
