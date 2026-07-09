---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:2007](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2007)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2013](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2013)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:2019](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2019)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:2017](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2017)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2015](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2015)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2009](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2009)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2011](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2011)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2021](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2021)

Token usage information (if provided by the adapter)
