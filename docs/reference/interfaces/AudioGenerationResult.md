---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1732](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1732)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1738](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1738)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1734](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1734)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1736](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1736)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1740](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1740)

Token usage information (if available)
