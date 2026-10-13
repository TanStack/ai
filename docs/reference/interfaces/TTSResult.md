---
id: TTSResult
title: TTSResult
---

Defined in: [packages/ai/src/types.ts:2969](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2969)

Result of text-to-speech generation.

## Properties

### alignment?

```ts
optional alignment?: TTSAlignment;
```

Defined in: [packages/ai/src/types.ts:2984](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2984)

Character- or word-level timings, present when `timestamps: true` was
requested. Use this rather than `duration` to find where *speech* ends.

***

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2995](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2995)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2975](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2975)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2991](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2991)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2979](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2979)

Duration of the audio file in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2977](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2977)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2971](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2971)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2973](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2973)

Model used for generation

***

### segments?

```ts
optional segments?: TTSSegment[];
```

Defined in: [packages/ai/src/types.ts:2989](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2989)

Per-turn (or per-utterance) spans of the audio, present when
`timestamps: true` was requested and the provider reports segmentation.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2993](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2993)

Token usage information (if provided by the adapter)
