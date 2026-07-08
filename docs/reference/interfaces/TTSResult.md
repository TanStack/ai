---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:1908](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1908)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:1914](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1914)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:1920](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1920)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1918](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1918)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:1916](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1916)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1910](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1910)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1912](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1912)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1922](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1922)

Token usage information (if provided by the adapter)
