---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [types.ts:1160](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1160)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [types.ts:1166](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1166)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [types.ts:1172](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1172)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1170](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1170)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [types.ts:1168](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1168)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [types.ts:1162](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1162)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [types.ts:1164](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1164)

Model used for generation
