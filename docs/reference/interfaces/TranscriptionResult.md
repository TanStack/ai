---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:2809](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2809)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2827](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2827)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2819](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2819)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2811](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2811)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2817](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2817)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2813](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2813)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2821](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2821)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2815](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2815)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2825](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2825)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2823](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2823)

Word-level timestamps, if available
