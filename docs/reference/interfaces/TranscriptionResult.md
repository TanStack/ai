---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:3250](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3250)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3268](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3268)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3260](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3260)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3252](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3252)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3258](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3258)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3254](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3254)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:3262](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3262)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3256](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3256)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3266](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3266)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:3264](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3264)

Word-level timestamps, if available
