---
id: TTSResult
title: TTSResult
---

Defined in: [packages/ai/src/types.ts:2732](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2732)

Result of text-to-speech generation.

## Properties

### alignment?

```ts
optional alignment?: TTSAlignment;
```

Defined in: [packages/ai/src/types.ts:2747](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2747)

Character- or word-level timings, present when `timestamps: true` was
requested. Use this rather than `duration` to find where *speech* ends.

***

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2758](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2758)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2738](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2738)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2754](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2754)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2742](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2742)

Duration of the audio file in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2740](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2740)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2734](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2734)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2736](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2736)

Model used for generation

***

### segments?

```ts
optional segments?: TTSSegment[];
```

Defined in: [packages/ai/src/types.ts:2752](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2752)

Per-turn (or per-utterance) spans of the audio, present when
`timestamps: true` was requested and the provider reports segmentation.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2756](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2756)

Token usage information (if provided by the adapter)
