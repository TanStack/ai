---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1311](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1311)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/typescript/ai/src/types.ts:1317](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1317)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1313](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1313)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1315](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1315)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1319](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1319)

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
