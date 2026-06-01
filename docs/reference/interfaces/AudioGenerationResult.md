---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1624](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1624)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1630](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1630)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1626](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1626)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1628](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1628)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/ai/src/types.ts:1632](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1632)

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
