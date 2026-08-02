---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:2048](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2048)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2054](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2054)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:2060](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2060)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:2058](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2058)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2056](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2056)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2050](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2050)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2052](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2052)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2062](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2062)

Token usage information (if provided by the adapter)
