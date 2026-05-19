---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1512](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1512)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/typescript/ai/src/types.ts:1518](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1518)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1514](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1514)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1516](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1516)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1520](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1520)

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
