---
id: TTSResult
title: TTSResult
---

Defined in: [packages/ai/src/types.ts:2994](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2994)

Result of text-to-speech generation.

## Properties

### alignment?

```ts
optional alignment?: TTSAlignment;
```

Defined in: [packages/ai/src/types.ts:3009](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3009)

Character- or word-level timings, present when `timestamps: true` was
requested. Use this rather than `duration` to find where *speech* ends.

***

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3020](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3020)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:3000](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3000)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:3016](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3016)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3004](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3004)

Duration of the audio file in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:3002](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3002)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2996](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2996)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2998](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2998)

Model used for generation

***

### segments?

```ts
optional segments?: TTSSegment[];
```

Defined in: [packages/ai/src/types.ts:3014](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3014)

Per-turn (or per-utterance) spans of the audio, present when
`timestamps: true` was requested and the provider reports segmentation.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3018](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3018)

Token usage information (if provided by the adapter)
