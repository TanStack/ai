---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1517](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1517)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/typescript/ai/src/types.ts:1523](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1523)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1519](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1519)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1521](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1521)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1525](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1525)

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
