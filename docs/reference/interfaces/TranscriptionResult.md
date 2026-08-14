---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:2600](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2600)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2618](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2618)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2610](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2610)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2602](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2602)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2608](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2608)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2604](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2604)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2612](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2612)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2606](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2606)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2616](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2616)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2614](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2614)

Word-level timestamps, if available
