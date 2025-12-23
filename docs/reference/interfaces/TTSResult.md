---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [types.ts:930](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L930)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [types.ts:936](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L936)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [types.ts:942](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L942)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:940](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L940)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [types.ts:938](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L938)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [types.ts:932](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L932)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [types.ts:934](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L934)

Model used for generation
