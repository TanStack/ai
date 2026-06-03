---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:1687](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1687)

Result of text-to-speech generation.

## Properties

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:1693](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1693)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:1699](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1699)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:1697](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1697)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:1695](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1695)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:1689](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1689)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:1691](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1691)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:1701](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1701)

Token usage information (if provided by the adapter)
