---
id: TTSResult
title: TTSResult
---

Defined in: [packages/ai/src/types.ts:2598](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2598)

Result of text-to-speech generation.

## Properties

### alignment?

```ts
optional alignment?: TTSAlignment;
```

Defined in: [packages/ai/src/types.ts:2613](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2613)

Character- or word-level timings, present when `timestamps: true` was
requested. Use this rather than `duration` to find where *speech* ends.

***

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2624](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2624)

Persisted artifact references for generated assets, when available

***

### audio

```ts
audio: string;
```

Defined in: [packages/ai/src/types.ts:2604](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2604)

Base64-encoded audio data

***

### contentType?

```ts
optional contentType?: string;
```

Defined in: [packages/ai/src/types.ts:2620](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2620)

Content type of the audio (e.g., 'audio/mp3')

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2608](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2608)

Duration of the audio file in seconds, if available

***

### format

```ts
format: string;
```

Defined in: [packages/ai/src/types.ts:2606](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2606)

Audio format of the generated audio

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2600](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2600)

Unique identifier for the generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2602](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2602)

Model used for generation

***

### segments?

```ts
optional segments?: TTSSegment[];
```

Defined in: [packages/ai/src/types.ts:2618](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2618)

Per-turn (or per-utterance) spans of the audio, present when
`timestamps: true` was requested and the provider reports segmentation.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2622](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2622)

Token usage information (if provided by the adapter)
