---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1642](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1642)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1648](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1648)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1654](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1654)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1652](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1652)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1650](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1650)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1644](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1644)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1646](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1646)

Model used for generation
