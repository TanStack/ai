---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1574](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1574)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1580](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1580)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1586](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1586)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1584](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1584)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1582](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1582)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1576](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1576)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1578](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1578)

Model used for generation
