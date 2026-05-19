---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1502](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1502)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/typescript/ai/src/types.ts:1508](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1508)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1504](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1504)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1506](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1506)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1510](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1510)

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
