---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:2613](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2613)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2631](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2631)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2623](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2623)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2615](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2615)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2621](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2621)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2617](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2617)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2625](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2625)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2619](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2619)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2629](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2629)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2627](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2627)

Word-level timestamps, if available
