---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:2727](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2727)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2745](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2745)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2737](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2737)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2729](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2729)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2735](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2735)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2731](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2731)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2739](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2739)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2733](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2733)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2743](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2743)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2741](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2741)

Word-level timestamps, if available
