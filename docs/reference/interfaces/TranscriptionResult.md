---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:3268](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3268)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3286](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3286)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3278](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3278)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3270](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3270)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3276](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3276)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3272](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3272)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:3280](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3280)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3274](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3274)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3284](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3284)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:3282](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3282)

Word-level timestamps, if available
