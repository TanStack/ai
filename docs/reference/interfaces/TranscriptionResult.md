---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: packages/ai/src/types.ts:3202

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: packages/ai/src/types.ts:3220

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: packages/ai/src/types.ts:3212

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: packages/ai/src/types.ts:3204

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: packages/ai/src/types.ts:3210

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: packages/ai/src/types.ts:3206

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: packages/ai/src/types.ts:3214

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: packages/ai/src/types.ts:3208

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: packages/ai/src/types.ts:3218

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: packages/ai/src/types.ts:3216

Word-level timestamps, if available
