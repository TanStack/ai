---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:2259](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2259)

Result of text-to-speech generation.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2275](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2275)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2265](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2265)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2271](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2271)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2269](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2269)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2267](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2267)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2261](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2261)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2263](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2263)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2273](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2273)

Token usage information (if provided by the adapter)
