---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:1835](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1835)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:1841](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1841)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:1847](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1847)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1845](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1845)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:1843](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1843)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1837](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1837)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1839](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1839)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1849](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1849)

Token usage information (if provided by the adapter)
