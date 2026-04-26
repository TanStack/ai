---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1306](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1306)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/typescript/ai/src/types.ts:1312](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1312)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1308](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1308)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1310](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1310)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1314](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1314)

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
