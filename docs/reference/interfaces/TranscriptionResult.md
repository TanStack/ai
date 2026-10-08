---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:3006](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3006)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3024](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3024)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3016](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3016)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3008](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3008)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3014](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3014)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3010](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3010)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:3018](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3018)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3012](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3012)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3022](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3022)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:3020](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3020)

Word-level timestamps, if available
