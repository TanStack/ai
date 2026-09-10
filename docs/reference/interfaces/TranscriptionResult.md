---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:2355](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2355)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2373](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2373)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2365](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2365)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2357](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2357)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2363](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2363)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2359](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2359)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2367](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2367)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2361](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2361)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2371](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2371)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2369](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2369)

Word-level timestamps, if available
