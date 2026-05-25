---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1658](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1658)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1664](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1664)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1670](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1670)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1668](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1668)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1666](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1666)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1660](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1660)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1662](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1662)

Model used for generation
