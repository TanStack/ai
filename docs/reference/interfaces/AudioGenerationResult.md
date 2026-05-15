---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1423](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1423)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/typescript/ai/src/types.ts:1429](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1429)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1425](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1425)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1427](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1427)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1431](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1431)

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
