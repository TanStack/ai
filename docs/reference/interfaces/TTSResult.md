---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:1700](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1700)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:1706](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1706)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:1712](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1712)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1710](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1710)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:1708](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1708)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1702](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1702)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1704](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1704)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1714](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1714)

Token usage information (if provided by the adapter)
