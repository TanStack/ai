---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:3027](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3027)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3045](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3045)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3037](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3037)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3029](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3029)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3035](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3035)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3031](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3031)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:3039](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3039)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3033](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3033)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3043](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3043)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:3041](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3041)

Word-level timestamps, if available
