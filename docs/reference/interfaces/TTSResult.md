---
id: TTSResult
title: TTSResult
---

Defined in: [packages/ai/src/types.ts:2475](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2475)

Result of text-to-speech generation.

## Properties

### alignment?

```ts
optional alignment?: TTSAlignment;
```

Defined in: [packages/ai/src/types.ts:2490](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2490)

Character- or word-level timings, present when `timestamps: true` was
requested. Use this rather than `duration` to find where *speech* ends.

***

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2501](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2501)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2481](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2481)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2497](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2497)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2485](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2485)

Duration of the audio file in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2483](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2483)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2477](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2477)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2479](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2479)

Model used for generation

***

### segments?

```ts
optional segments?: TTSSegment[];
```

Defined in: [packages/ai/src/types.ts:2495](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2495)

Per-turn (or per-utterance) spans of the audio, present when
`timestamps: true` was requested and the provider reports segmentation.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2499](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2499)

Token usage information (if provided by the adapter)
