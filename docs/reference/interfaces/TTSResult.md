---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:2016](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2016)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2022](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2022)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:2028](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2028)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:2026](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2026)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2024](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2024)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2018](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2018)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2020](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2020)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2030](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2030)

Token usage information (if provided by the adapter)
