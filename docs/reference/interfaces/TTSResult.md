---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:1722](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1722)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:1728](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1728)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:1734](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1734)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1732](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1732)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:1730](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1730)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1724](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1724)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1726](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1726)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1736](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1736)

Token usage information (if provided by the adapter)
