---
id: TTSResult
title: TTSResult
---

Defined in: [packages/ai/src/types.ts:2387](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2387)

Result of text-to-speech generation.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2403](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2403)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2393](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2393)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2399](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2399)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2397](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2397)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2395](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2395)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2389](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2389)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2391](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2391)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2401](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2401)

Token usage information (if provided by the adapter)
