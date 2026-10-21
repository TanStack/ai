---
id: TTSResult
title: TTSResult
---

Defined in: [packages/ai/src/types.ts:3011](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3011)

Result of text-to-speech generation.

## Properties

### alignment?

```ts
optional alignment?: TTSAlignment;
```

Defined in: [packages/ai/src/types.ts:3026](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3026)

Character- or word-level timings, present when `timestamps: true` was
requested. Use this rather than `duration` to find where *speech* ends.

***

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3037](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3037)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:3017](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3017)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:3033](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3033)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3021](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3021)

Duration of the audio file in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:3019](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3019)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3013](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3013)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3015](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3015)

Model used for generation

***

### segments?

```ts
optional segments?: TTSSegment[];
```

Defined in: [packages/ai/src/types.ts:3031](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3031)

Per-turn (or per-utterance) spans of the audio, present when
`timestamps: true` was requested and the provider reports segmentation.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3035](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3035)

Token usage information (if provided by the adapter)
