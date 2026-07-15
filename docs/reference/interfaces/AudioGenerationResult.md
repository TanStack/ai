---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1873](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1873)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1879](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1879)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1875](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1875)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1877](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1877)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1881](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1881)

Token usage information (if available)
