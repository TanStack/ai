---
id: TTSResult
title: TTSResult
---

Defined in: [packages/ai/src/types.ts:2753](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2753)

Result of text-to-speech generation.

## Properties

### alignment?

```ts
optional alignment?: TTSAlignment;
```

Defined in: [packages/ai/src/types.ts:2768](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2768)

Character- or word-level timings, present when `timestamps: true` was
requested. Use this rather than `duration` to find where *speech* ends.

***

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2779](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2779)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2759](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2759)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2775](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2775)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2763](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2763)

Duration of the audio file in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2761](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2761)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2755](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2755)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2757](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2757)

Model used for generation

***

### segments?

```ts
optional segments?: TTSSegment[];
```

Defined in: [packages/ai/src/types.ts:2773](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2773)

Per-turn (or per-utterance) spans of the audio, present when
`timestamps: true` was requested and the provider reports segmentation.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2777](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2777)

Token usage information (if provided by the adapter)
