---
id: TTSResult
title: TTSResult
---

Defined in: [packages/ai/src/types.ts:2453](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2453)

Result of text-to-speech generation.

## Properties

### alignment?

```ts
optional alignment?: TTSAlignment;
```

Defined in: [packages/ai/src/types.ts:2468](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2468)

Character- or word-level timings, present when `timestamps: true` was
requested. Use this rather than `duration` to find where *speech* ends.

***

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2479](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2479)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2459](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2459)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2475](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2475)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2463](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2463)

Duration of the audio file in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2461](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2461)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2455](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2455)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2457](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2457)

Model used for generation

***

### segments?

```ts
optional segments?: TTSSegment[];
```

Defined in: [packages/ai/src/types.ts:2473](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2473)

Per-turn (or per-utterance) spans of the audio, present when
`timestamps: true` was requested and the provider reports segmentation.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2477](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2477)

Token usage information (if provided by the adapter)
