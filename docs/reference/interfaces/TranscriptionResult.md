---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:2749](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2749)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2767](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2767)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2759](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2759)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2751](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2751)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2757](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2757)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2753](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2753)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2761](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2761)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2755](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2755)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2765](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2765)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2763](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2763)

Word-level timestamps, if available
