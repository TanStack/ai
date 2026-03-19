---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [types.ts:1153](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1153)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [types.ts:1159](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1159)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [types.ts:1165](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1165)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1163](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1163)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [types.ts:1161](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1161)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [types.ts:1155](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1155)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [types.ts:1157](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1157)

Model used for generation
