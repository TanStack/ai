---
id: AudioGenerationResult
title: AudioGenerationResult
---

# Interface: AudioGenerationResult

Defined in: [packages/typescript/ai/src/types.ts:1454](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1454)

Result of audio generation

## Properties

### audio

```ts
audio: GeneratedAudio;
```

Defined in: [packages/typescript/ai/src/types.ts:1460](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1460)

The generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1456](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1456)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1458](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1458)

Model used for generation

***

### usage?

```ts
optional usage: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1462](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1462)

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
