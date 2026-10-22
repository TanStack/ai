---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:3285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3285)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3303](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3303)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3295](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3295)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3287)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3293](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3293)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3289](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3289)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:3297](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3297)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3291](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3291)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3301](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3301)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:3299](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3299)

Word-level timestamps, if available
