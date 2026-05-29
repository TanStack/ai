---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1567](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1567)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1573](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1573)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1569](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1569)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1571](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1571)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/ai/src/types.ts:1575](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1575)

Token usage information (if available)

#### inputTokens?

```ts
optional inputTokens: number;
```

#### outputTokens?

```ts
optional outputTokens: number;
```

#### totalTokens?

```ts
optional totalTokens: number;
```
