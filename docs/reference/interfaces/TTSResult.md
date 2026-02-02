---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [types.ts:1074](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1074)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [types.ts:1080](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1080)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [types.ts:1086](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1086)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:1084](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1084)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [types.ts:1082](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1082)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [types.ts:1076](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1076)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [types.ts:1078](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1078)

Model used for generation
