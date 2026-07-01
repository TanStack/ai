---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:1886](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1886)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:1892](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1892)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:1898](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1898)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1896](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1896)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:1894](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1894)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1888](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1888)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1890](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1890)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1900](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1900)

Token usage information (if provided by the adapter)
