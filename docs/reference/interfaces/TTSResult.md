---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1637](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1637)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1643](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1643)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1649](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1649)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1647](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1647)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1645](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1645)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1639](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1639)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1641](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1641)

Model used for generation
