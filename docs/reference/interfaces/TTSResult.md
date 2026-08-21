---
id: TTSResult
title: TTSResult
---

# Interface: TTSResult

Defined in: [packages/ai/src/types.ts:2517](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2517)

Result of text-to-speech generation.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2533](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2533)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2523](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2523)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2529](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2529)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2527](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2527)

Duration of the audio in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2525](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2525)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2519](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2519)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2521](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2521)

Model used for generation

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2531](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2531)

Token usage information (if provided by the adapter)
