---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1543](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1543)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1549](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1549)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1555](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1555)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1553](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1553)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1551](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1551)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1545](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1545)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1547](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1547)

Model used for generation
