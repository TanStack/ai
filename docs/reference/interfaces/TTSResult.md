---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:2241](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2241)

Result of text-to-speech generation.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2257](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2257)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2247](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2247)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2253](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2253)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2251](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2251)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2249](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2249)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2243](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2243)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2245](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2245)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2255](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2255)

Token usage information (if provided by the adapter)
