---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1439](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1439)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1445](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1445)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1451](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1451)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1449](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1449)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1447](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1447)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1441](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1441)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1443](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1443)

Model used for generation
