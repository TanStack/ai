---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:2621](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2621)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2639](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2639)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2631](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2631)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2623](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2623)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2629](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2629)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2625](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2625)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2633](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2633)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2627](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2627)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2637](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2637)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2635](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2635)

Word-level timestamps, if available
