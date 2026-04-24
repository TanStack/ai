---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/typescript/ai/src/types.ts:1357](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1357)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1363](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1363)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1369](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1369)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/typescript/ai/src/types.ts:1367](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1367)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1365](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1365)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1359](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1359)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1361](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1361)

Model used for generation
