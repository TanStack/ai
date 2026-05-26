---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1522](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1522)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/typescript/ai/src/types.ts:1528](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1528)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1524](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1524)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1526](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1526)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1530](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1530)

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
