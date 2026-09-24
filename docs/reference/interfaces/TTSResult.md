---
id: TTSResult
title: TTSResult
---

Defined in: [packages/ai/src/types.ts:2535](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2535)

Result of text-to-speech generation.

## Properties

### alignment?

```ts
optional alignment?: TTSAlignment;
```

Defined in: [packages/ai/src/types.ts:2550](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2550)

Character- or word-level timings, present when `timestamps: true` was
requested. Use this rather than `duration` to find where *speech* ends.

***

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2561](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2561)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2541](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2541)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2557](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2557)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2545](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2545)

Duration of the audio file in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2543)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2537](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2537)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2539](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2539)

Model used for generation

***

### segments?

```ts
optional segments?: TTSSegment[];
```

Defined in: [packages/ai/src/types.ts:2555](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2555)

Per-turn (or per-utterance) spans of the audio, present when
`timestamps: true` was requested and the provider reports segmentation.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2559](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2559)

Token usage information (if provided by the adapter)
