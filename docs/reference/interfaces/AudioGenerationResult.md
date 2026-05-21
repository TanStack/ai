---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1521](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1521)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/typescript/ai/src/types.ts:1527](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1527)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1523](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1523)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1525](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1525)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1529](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1529)

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
