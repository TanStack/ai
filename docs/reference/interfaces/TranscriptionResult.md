---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:2483](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2483)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2501](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2501)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2493](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2493)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2485](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2485)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2491](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2491)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2487](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2487)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2495](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2495)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2489](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2489)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2499](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2499)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2497](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2497)

Word-level timestamps, if available
