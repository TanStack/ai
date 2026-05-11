---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1319](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1319)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/typescript/ai/src/types.ts:1325](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1325)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1321](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1321)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1323](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1323)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1327](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1327)

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
