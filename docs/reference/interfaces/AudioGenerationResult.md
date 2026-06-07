---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1577](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1577)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1583](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1583)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1579](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1579)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1581](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1581)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1585](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1585)

Token usage information (if available)
