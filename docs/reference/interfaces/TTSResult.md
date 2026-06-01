---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:1744](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1744)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:1750](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1750)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:1756](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1756)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1754](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1754)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:1752](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1752)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1746](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1746)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1748](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1748)

Model used for generation
