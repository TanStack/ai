---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1774](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1774)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1780](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1780)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1776](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1776)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1778](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1778)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1782](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1782)

Token usage information (if available)
