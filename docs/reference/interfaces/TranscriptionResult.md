---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:3243](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3243)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3261](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3261)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3253](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3253)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3245](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3245)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3251](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3251)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3247](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3247)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:3255](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3255)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3249](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3249)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3259](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3259)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:3257](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3257)

Word-level timestamps, if available
