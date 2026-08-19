---
id: TranscriptionResult
title: TranscriptionResult
---

# Interface: TranscriptionResult

Defined in: [packages/ai/src/types.ts:2608](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2608)

Result of audio transcription.

## Properties

### artifacts?

```ts
optional artifacts?: PersistedArtifactRef[];
```

Defined in: [packages/ai/src/types.ts:2626](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2626)

Persisted artifact references for generated assets, when available

***

### duration?

```ts
optional duration?: number;
```

Defined in: [packages/ai/src/types.ts:2618](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2618)

Duration of the audio in seconds

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2610](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2610)

Unique identifier for the transcription

***

### language?

```ts
optional language?: string;
```

Defined in: [packages/ai/src/types.ts:2616](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2616)

Language detected or specified

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2612](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2612)

Model used for transcription

***

### segments?

```ts
optional segments?: TranscriptionSegment[];
```

Defined in: [packages/ai/src/types.ts:2620](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2620)

Detailed segments with timing, if available

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2614](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2614)

The full transcribed text

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2624](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2624)

Token usage information (if provided by the adapter)

***

### words?

```ts
optional words?: TranscriptionWord[];
```

Defined in: [packages/ai/src/types.ts:2622](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2622)

Word-level timestamps, if available
