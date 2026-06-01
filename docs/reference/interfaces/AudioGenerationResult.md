---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1606](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1606)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1612](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1612)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1608](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1608)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1610](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1610)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1614](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1614)

Token usage information (if available)
