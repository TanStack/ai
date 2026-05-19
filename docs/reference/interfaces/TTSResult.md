---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1622](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1622)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1628](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1628)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1634](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1634)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1632](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1632)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1630](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1630)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1624](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1624)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1626](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1626)

Model used for generation
