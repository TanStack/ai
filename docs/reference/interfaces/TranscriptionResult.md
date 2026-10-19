---
id: TranscriptionResult
title: TranscriptionResult
---

Defined in: [packages/ai/src/types.ts:3279](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3279)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:3297](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3297)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:3289](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3289)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:3281](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3281)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:3287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3287)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:3283](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3283)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:3291](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3291)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:3285](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3285)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:3295](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3295)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:3293](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L3293)

Word-level timestamps, if available
