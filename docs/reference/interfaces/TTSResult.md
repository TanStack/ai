---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:2512](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2512)

Result of text-to-speech generation.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2528](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2528)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2518](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2518)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2524](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2524)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2522](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2522)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2520](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2520)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2514](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2514)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2516](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2516)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2526](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2526)

Token usage information (if provided by the adapter)
