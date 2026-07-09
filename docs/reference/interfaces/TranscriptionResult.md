---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:2151](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2151)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2169](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2169)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration: number;
```

Defined in: [packages/ai/src/types.ts:2161](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2161)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2153](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2153)

Unique identifier for the transcription

***

### language?

```ts
optional language: string;
```

Defined in: [packages/ai/src/types.ts:2159](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2159)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2155](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2155)

Model used for transcription

***

### segments?

```ts
optional segments: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2163](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2163)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2157](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2157)

The full transcribed text

***

### usage?

```ts
optional usage: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2167](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2167)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2165](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2165)

Word-level timestamps, if available
