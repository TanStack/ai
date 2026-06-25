---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:1813](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1813)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:1819](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1819)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:1825](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1825)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1823](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1823)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:1821](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1821)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1815](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1815)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1817](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1817)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1827](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1827)

Token usage information (if provided by the adapter)
