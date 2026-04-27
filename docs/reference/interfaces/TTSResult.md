---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1426](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1426)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1432](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1432)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1438](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1438)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1436](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1436)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1434](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1434)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1428](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1428)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1430](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1430)

Model used for generation
