---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1327](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1327)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1333](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1333)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1339](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1339)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1337](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1337)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1335](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1335)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1329](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1329)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1331](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1331)

Model used for generation
