---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/ai/src/types.ts:1538](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1538)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/ai/src/types.ts:1544](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1544)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1540](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1540)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1542](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1542)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/ai/src/types.ts:1546](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1546)

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
