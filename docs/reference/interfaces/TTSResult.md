---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [types.ts:909](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L909)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [types.ts:915](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L915)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [types.ts:921](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L921)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [types.ts:919](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L919)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [types.ts:917](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L917)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [types.ts:911](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L911)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [types.ts:913](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L913)

Model used for generation
