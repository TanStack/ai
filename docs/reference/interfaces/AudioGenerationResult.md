---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1571](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1571)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1577](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1577)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1573](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1573)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1575](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1575)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1579](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1579)

Token usage information (if available)
