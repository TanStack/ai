---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:2337](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2337)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2355](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2355)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2347](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2347)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2339](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2339)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2345](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2345)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2341](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2341)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2349](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2349)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2343](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2343)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2353](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2353)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2351](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2351)

Word-level timestamps, if available
