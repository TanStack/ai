---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1914](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1914)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1920](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1920)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1916](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1916)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1918](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1918)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1922](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1922)

Token usage information (if available)
