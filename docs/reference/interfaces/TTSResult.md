---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:2061](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2061)

Result of text-to-speech generation.

## Properties

### artifacts?

```ts
optional artifacts: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2077](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2077)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2067](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2067)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType: string;
```

Defined in: [packages/ai/src/types.ts:2073](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2073)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:2071](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2071)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2069](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2069)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2063](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2063)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2065](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2065)

Model used for generation

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2075](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2075)

Token usage information (if provided by the adapter)
