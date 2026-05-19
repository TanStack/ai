---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1632](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1632)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1638](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1638)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1644](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1644)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1642](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1642)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1640](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1640)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1634](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1634)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1636](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1636)

Model used for generation
